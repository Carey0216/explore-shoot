import { $, esc, icon, closeModal } from './ui.js';
let showing = false;
export const tourIsOpen = () => showing;
export function showFeatureTour({ steps, audience = 'user', label = '功能引导', done }) {
  if (showing || !steps.length) return false;
  showing = true;
  closeModal();
  const previous = document.activeElement,
    root = document.createElement('section');
  root.className = 'feature-tour';
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  root.dataset.audience = audience;
  root.innerHTML =
    '<div class="tour-mask tour-mask-top"></div><div class="tour-mask tour-mask-bottom"></div><div class="tour-mask tour-mask-left"></div><div class="tour-mask tour-mask-right"></div><div class="tour-focus" aria-hidden="true"></div><article class="tour-card"></article>';
  document.body.append(root);
  root.showPopover?.();
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  let index = 0;
  const finish = (guides = false) => {
    root.remove();
    document.body.style.overflow = previousOverflow;
    showing = false;
    window.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('resize', position);
    document.removeEventListener('keydown', keys, true);
    previous?.focus?.({ preventScroll: true });
    if (guides) location.hash = audience === 'admin' ? 'updates' : 'guides';
    done?.();
  };
  function position() {
    const [selector] = steps[index],
      target = document.querySelector(selector),
      r = target?.getBoundingClientRect();
    const frame =
        audience === 'user' ? document.querySelector('#topbar')?.getBoundingClientRect() : null,
      left = Math.max(0, frame?.left || 0),
      width = audience === 'user' ? Math.min(480, innerWidth - left) : innerWidth,
      height = window.visualViewport?.height || innerHeight,
      offset = window.visualViewport?.offsetTop || 0;
    root.style.left = left + 'px';
    root.style.width = width + 'px';
    root.style.top = offset + 'px';
    root.style.height = height + 'px';
    const box = {
      left: Math.max(6, (r?.left || left + width / 2) - left - 7),
      top: Math.max(6, Math.min(height - 64, (r?.top || height / 2) - offset - 7)),
      width: (r?.width || 44) + 14,
      height: (r?.height || 44) + 14,
    };
    box.width = Math.min(box.width, width - box.left - 6);
    box.height = Math.min(box.height, height - box.top - 6);
    const focus = $('.tour-focus', root);
    Object.assign(focus.style, {
      left: box.left + 'px',
      top: box.top + 'px',
      width: box.width + 'px',
      height: box.height + 'px',
    });
    Object.assign($('.tour-mask-top', root).style, {
      left: 0,
      top: 0,
      width: '100%',
      height: box.top + 'px',
    });
    Object.assign($('.tour-mask-bottom', root).style, {
      left: 0,
      top: box.top + box.height + 'px',
      width: '100%',
      bottom: 0,
    });
    Object.assign($('.tour-mask-left', root).style, {
      left: 0,
      top: box.top + 'px',
      width: box.left + 'px',
      height: box.height + 'px',
    });
    Object.assign($('.tour-mask-right', root).style, {
      left: box.left + box.width + 'px',
      right: 0,
      top: box.top + 'px',
      height: box.height + 'px',
    });
    const card = $('.tour-card', root),
      ch = card.offsetHeight || 240;
    if (audience === 'admin') {
      card.style.width = Math.min(420, width - 32) + 'px';
      card.style.left =
        Math.max(
          16,
          Math.min(
            width - Math.min(420, width - 32) - 16,
            box.left + box.width / 2 - Math.min(420, width - 32) / 2,
          ),
        ) + 'px';
      card.style.right = 'auto';
    }
    const below = box.top + box.height + 20;
    card.style.top =
      Math.max(
        12,
        Math.min(height - ch - 12, below + ch <= height - 12 ? below : box.top - ch - 20),
      ) + 'px';
  }
  function draw() {
    const [, glyph, title, copy] = steps[index];
    $('.tour-card', root).innerHTML =
      `<header><span>${icon(glyph)}</span><small>${index + 1} / ${steps.length} · ${esc(label)}</small><button data-no-liquid data-tour-close aria-label="关闭引导">${icon('close')}</button></header><h2>${esc(title)}</h2><p>${esc(copy)}</p><div class="tour-actions"><button data-no-liquid data-tour-skip>跳过引导</button>${index ? '<button data-no-liquid data-tour-prev>上一步</button>' : ''}<button data-no-liquid data-tour-next>${index === steps.length - 1 ? '开始体验' : '下一步'}</button></div>${index === steps.length - 1 ? (audience === 'admin' ? '<a href="#updates" data-tour-guides>查看管理端更新与操作说明 ↗</a>' : '<a href="#guides" data-tour-guides>先看看新生拍摄指南 ↗</a>') : ''}`;
    $('[data-tour-close]', root).onclick = () => finish();
    $('[data-tour-skip]', root).onclick = () => finish();
    $('[data-tour-prev]', root)?.addEventListener('click', () => {
      index--;
      draw();
    });
    $('[data-tour-next]', root).onclick = () => {
      if (index === steps.length - 1) finish();
      else {
        index++;
        draw();
      }
    };
    $('[data-tour-guides]', root)?.addEventListener('click', (e) => {
      e.preventDefault();
      finish(true);
    });
    position();
    $('[data-tour-next]', root).focus({ preventScroll: true });
  }
  function keys(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    }
    if (e.key === 'Tab') {
      const controls = [...root.querySelectorAll('button,a')],
        i = controls.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        controls.at(-1).focus();
      } else if (!e.shiftKey && i === controls.length - 1) {
        e.preventDefault();
        controls[0].focus();
      }
    }
  }
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  document.addEventListener('keydown', keys, true);
  draw();
}
