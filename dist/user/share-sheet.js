import { closeModal, icon } from '/shared/ui.js';

const appIcon = (body) =>
  `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${body}</svg>`;
const brands = {
  wechat: appIcon(
    '<path fill="currentColor" d="M20 7C10.6 7 3 13.1 3 20.5c0 4.2 2.5 8 6.4 10.4l-1.6 5.5 6-3.1c1.9.5 4 .8 6.2.8h.8a13 13 0 0 1-1.2-5.5c0-7.2 6.3-13.2 14.5-14.1C31.3 10.1 26 7 20 7Z"/><ellipse fill="currentColor" cx="33.5" cy="29.5" rx="13.5" ry="10.5"/><path fill="currentColor" d="m38 37 7 6-2-10Z"/><g fill="var(--brand-color)"><circle cx="13.5" cy="18" r="1.7"/><circle cx="24.5" cy="18" r="1.7"/><circle cx="29" cy="27" r="1.4"/><circle cx="38" cy="27" r="1.4"/></g>',
  ),
  qq: appIcon(
    '<path fill="currentColor" d="M24 4c-7 0-11 6-11 15-2 3-5 9-4 13 .3 2 2 1 4-2 0 4 1 6 3 8-5 1-6 4-2 5 4 1 7-1 10-2 3 1 6 3 10 2 4-1 3-4-2-5 2-2 3-4 3-8 2 3 3.7 4 4 2 1-4-2-10-4-13C35 10 31 4 24 4Z"/><g fill="var(--brand-color)"><ellipse cx="20" cy="16" rx="1.5" ry="2.2"/><ellipse cx="28" cy="16" rx="1.5" ry="2.2"/><path d="m20 22 4 3 4-3Z"/></g>',
  ),
};
function choice(id, label, graphic, kind = '', extra = '') {
  return `<button type="button" data-no-liquid class="share-choice ${kind}" ${id ? `id="${id}"` : ''} ${extra}><span class="share-choice-icon">${graphic}</span><span>${label}</span></button>`;
}
export function shareChoices() {
  return `<div class="share-app-row" aria-label="分享到应用">${choice('', '微信', brands.wechat, 'share-wechat', 'data-share-app="weixin://"')}${choice('', 'QQ好友', brands.qq, 'share-qq', 'data-share-app="mqq://"')}</div><div class="share-tool-row" aria-label="其他分享方式">${choice('point-copy-link', '复制链接', icon('copy'))}${choice('point-poster', '分享图片', icon('camera'))}${choice('point-native-share', '系统分享', icon('share'))}</div>`;
}
export function bindShareSheet(dialog) {
  dialog.classList.add('place-share-sheet');
  const closeButton = dialog.querySelector('.modal-close');
  closeButton.dataset.noLiquid = '';
  let closing = false,
    animation,
    backdropPress = false;
  const position = () => {
    const frame = document.querySelector('.app-shell')?.getBoundingClientRect();
    if (!frame) return;
    dialog.style.left = Math.max(0, frame.left) + 'px';
    dialog.style.width = Math.min(frame.width, innerWidth - Math.max(0, frame.left)) + 'px';
  };
  const close = () => {
    if (closing) return;
    closing = true;
    const reduce =
      document.documentElement.dataset.motion === 'reduce' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !dialog.animate) return closeModal();
    const current = getComputedStyle(dialog);
    animation = dialog.animate(
      [
        { transform: current.transform, opacity: current.opacity },
        { transform: 'translateY(100%)', opacity: 0.6 },
      ],
      { duration: 170, easing: 'ease-in', fill: 'forwards' },
    );
    animation.finished.then(
      () => {
        if (dialog.isConnected && dialog.open) closeModal();
      },
      () => {},
    );
  };
  closeButton.onclick = close;
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    },
    true,
  );
  const outside = (event) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    );
  };
  dialog.addEventListener('pointerdown', (event) => {
    backdropPress = outside(event);
  });
  dialog.addEventListener('pointercancel', () => {
    backdropPress = false;
  });
  dialog.addEventListener(
    'click',
    (event) => {
      if (backdropPress && outside(event)) {
        event.stopImmediatePropagation();
        close();
      }
      backdropPress = false;
    },
    true,
  );
  position();
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  return () => {
    animation?.cancel();
    window.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('resize', position);
  };
}
