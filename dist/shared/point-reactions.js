import { api, esc, icon, toast } from './ui.js';

export function reactionHTML(point) {
  const likes = Math.max(0, Number(point.likeCount) || 0);
  return `<div class="point-reactions" data-reaction-id="${esc(point.id)}" role="group" aria-label="点位评价"><button type="button" data-point-vote="like" data-vote-point="${esc(point.id)}" aria-pressed="${point.myReaction === 'like'}">${icon('thumb-up')}<span>喜欢</span><span class="reaction-count" data-i18n-skip>${likes}</span></button><button type="button" data-point-vote="dislike" data-vote-point="${esc(point.id)}" aria-pressed="${point.myReaction === 'dislike'}">${icon('thumb-down')}<span>不喜欢</span></button></div>`;
}

// One delegated listener survives card redraws. Only confirmed server results update the UI.
export function bindPointReactions({ state, requireAccount, onChanged }) {
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
    buttons().forEach((b) => {
      b.disabled = true;
    });
    try {
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
  return () => document.removeEventListener('click', click);
}
