import { api, esc, icon, toast } from './ui.js';

export function reactionHTML(point) {
  const likes = Math.max(0, Number(point.likeCount) || 0);
  return `<div class="point-reactions" data-reaction-id="${esc(point.id)}" role="group" aria-label="点位评价"><button type="button" data-point-vote="like" data-vote-point="${esc(point.id)}" aria-pressed="${point.myReaction === 'like'}">${icon('thumb-up')}<span>喜欢</span><span class="reaction-count" data-i18n-skip>${likes}</span></button><button type="button" data-point-vote="dislike" data-vote-point="${esc(point.id)}" aria-pressed="${point.myReaction === 'dislike'}">${icon('thumb-down')}<span>不喜欢</span></button></div>`;
}

let dismissConfirmation;
// A compact, non-modal surface grows beside the tapped control; no full-screen overlay.
export function confirmDislike(anchor) {
  dismissConfirmation?.();
  return new Promise((resolve) => {
    const panel = document.createElement('section');
    panel.className = 'reaction-confirm';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'reaction-confirm-title');
    panel.setAttribute('aria-describedby', 'reaction-confirm-description');
    panel.innerHTML = `<h2 id="reaction-confirm-title">确认不喜欢该作品？</h2><p id="reaction-confirm-description">标选为“不喜欢”的作品将会被移至最底部噢</p><button type="button" class="button danger reaction-confirm-action">确认不喜欢</button>`;
    document.body.append(panel);
    const rect = anchor.getBoundingClientRect();
    const bounds = { width: panel.offsetWidth, height: panel.offsetHeight };
    const left = Math.max(12, Math.min(rect.left, innerWidth - bounds.width - 12));
    const below = rect.bottom + bounds.height + 10 <= innerHeight - 12;
    const top = Math.max(12, below ? rect.bottom + 8 : rect.top - bounds.height - 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.transformOrigin = `${Math.max(16, Math.min(rect.left + rect.width / 2 - left, bounds.width - 16))}px ${below ? 'top' : 'bottom'}`;
    anchor.setAttribute('aria-expanded', 'true');
    let settled = false;
    const finish = (confirmed = false, restoreFocus = false) => {
      if (settled) return;
      settled = true;
      panel.remove();
      anchor.removeAttribute('aria-expanded');
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('hashchange', dismiss);
      if (dismissConfirmation === dismiss) dismissConfirmation = null;
      if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
      resolve(confirmed);
    };
    const dismiss = () => finish();
    const outside = (event) => {
      if (!panel.contains(event.target)) finish();
    };
    const keydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(false, true);
      }
    };
    panel.querySelector('button').onclick = () => finish(true, true);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('hashchange', dismiss);
    dismissConfirmation = dismiss;
    panel.querySelector('button').focus({ preventScroll: true });
  });
}

// One delegated listener survives card redraws. Only confirmed server results update the UI.
export function bindPointReactions({ state, requireAccount, onChanged, confirm = confirmDislike }) {
  const pending = new Set();
  const click = async (event) => {
    const button = event.target.closest?.('[data-point-vote]');
    if (!button || pending.has(button.dataset.votePoint)) return;
    const id = button.dataset.votePoint;
    if (!(await requireAccount()) || !state.account || pending.has(id)) return;
    const accountId = state.account.id;
    const value = button.getAttribute('aria-pressed') === 'true' ? null : button.dataset.pointVote;
    pending.add(id);
    const buttons = () =>
      [...document.querySelectorAll('[data-vote-point]')].filter((b) => b.dataset.votePoint === id);
    try {
      if (value === 'dislike' && !(await confirm(button))) return;
      if (state.account?.id !== accountId) return;
      buttons().forEach((b) => {
        b.disabled = true;
      });
      const result = await api('/api/points/' + encodeURIComponent(id) + '/reaction', 'PUT', {
        value,
      });
      if (state.account?.id !== accountId) return;
      for (const list of [state.catalog?.points, state.savedPoints]) {
        const point = list?.find((p) => p.id === id);
        if (point) Object.assign(point, result.point);
      }
      if (state.catalog)
        state.catalog.version = Math.max(state.catalog.version || 0, result.version || 0);
      document.querySelectorAll('[data-reaction-id]').forEach((box) => {
        if (box.dataset.reactionId !== id) return;
        box
          .querySelectorAll('[data-point-vote]')
          .forEach((b) =>
            b.setAttribute('aria-pressed', String(b.dataset.pointVote === result.point.myReaction)),
          );
        const count = box.querySelector('.reaction-count');
        if (count) count.textContent = String(result.point.likeCount);
      });
      window.dispatchEvent(new CustomEvent('point:reaction', { detail: { id } }));
      onChanged?.();
      if (value === 'dislike') toast('已减少推荐，此点位在你的列表中置底');
    } catch (e) {
      if (state.account?.id === accountId) toast(e.message);
    } finally {
      pending.delete(id);
      buttons().forEach((b) => {
        b.disabled = false;
      });
    }
  };
  document.addEventListener('click', click);
  return () => {
    dismissConfirmation?.();
    document.removeEventListener('click', click);
  };
}
