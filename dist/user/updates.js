import { $, api, esc, modal, closeModal } from '/shared/ui.js';
import { richHTML } from '/shared/rich-message.js';
import { onboardingState } from '/shared/onboarding-state.js';
export const updateContent = (item) =>
  `<article class="release-note"><span class="release-kicker">WHAT’S NEW · v${esc(item.version)}</span><h2>${esc(item.title)}</h2>${richHTML(item)}</article>`;
function presentUpdate(item) {
  const paragraphs = String(item.body || '')
    .split(/\n\s*\n/)
    .filter(Boolean);
  modal(
    '这次更新，带来了什么？',
    `<section class="whatsnew-summary"><div class="release-scroll-hint" role="status">向下滑动，看看这次的新变化 <span aria-hidden="true">⌄</span></div><span class="release-kicker">WHAT’S NEW · v${esc(item.version)}</span><h2>${esc(item.title.replace(/^v[\d.]+\s*[·-]\s*/, ''))}</h2><ul>${paragraphs.map((p) => `<li><span aria-hidden="true">✦</span><p>${esc(p)}</p></li>`).join('')}</ul><a class="text-btn" href="#updates" id="release-read-all">查看完整更新说明 ↗</a><button class="button wide" id="release-got-it">开始体验</button></section>`,
    (d) => {
      d.classList.add('whatsnew-dialog');
      const body = $('.dialog-body', d),
        hint = $('.release-scroll-hint', d);
      const updateHint = () => {
        hint.hidden = body.scrollHeight <= body.clientHeight + body.scrollTop + 12;
      };
      const observer = new ResizeObserver(updateHint);
      observer.observe(body);
      body.addEventListener('scroll', updateHint, { passive: true });
      requestAnimationFrame(updateHint);
      $('#release-got-it', d).onclick = closeModal;
      $('#release-read-all', d).onclick = closeModal;
      return () => observer.disconnect();
    },
  );
}
export async function mountUpdates(root, alive = () => true) {
  const data = await api('/api/updates');
  if (!alive()) return;
  root.removeAttribute('aria-busy');
  root.innerHTML = `<section class="release-page"><header><span class="eyebrow">WHAT’S NEW</span><h1>每次更新，都有新发现</h1><p class="muted">这里保留管理员检查并发布的版本说明。</p></header>${data.items.map(updateContent).join('') || '<p class="empty">本次更新说明正在整理，发布后会出现在这里和消息中心。</p>'}</section>`;
  if (data.items[0]) {
    const b = document.createElement('button');
    b.className = 'button secondary';
    b.textContent = '本次更新速览';
    b.onclick = () => presentUpdate(data.items[0]);
    root.querySelector('.release-page header').append(b);
  }
}
export async function showWhatsNew(account) {
  try {
    const { items } = await api('/api/updates');
    const item = items[0],
      history = onboardingState('user', account);
    if (!item || history.seen(item.version)) return;
    const show = () => {
      if (
        document.querySelector('dialog[open], .feature-tour') ||
        document.documentElement.classList.contains('viewport-blocked')
      )
        return;
      document.removeEventListener('campus:modal-closed', show);
      window.removeEventListener('viewport:mode', show);
      history.finish(item.version);
      presentUpdate(item);
    };
    document.addEventListener('campus:modal-closed', show);
    window.addEventListener('viewport:mode', show);
    show();
  } catch {
    /* Offline or draft-only updates must not interrupt the application. */
  }
}
