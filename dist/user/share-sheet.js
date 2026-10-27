import { closeModal, icon } from '/shared/ui.js';

const brands = {
  wechat: '<img src="/shared/brand/wechat-official.svg" alt="微信官方标识">',
  qq: '<img src="/shared/brand/qq-official.png" alt="QQ官方标识">',
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
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
