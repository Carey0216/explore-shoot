import { api } from './ui.js';
const remembered = new Set();
let stopEffect;
export function playCelebration({ duration = 2800, density = 72 } = {}) {
  if (
    document.documentElement.dataset.motion === 'reduce' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return;
  stopEffect?.();
  const canvas = document.createElement('canvas');
  canvas.className = 'celebration-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const topLayer = typeof canvas.showPopover === 'function';
  if (topLayer) canvas.setAttribute('popover', 'manual');
  (topLayer ? document.body : document.querySelector('dialog[open]') || document.body).append(
    canvas,
  );
  if (topLayer) canvas.showPopover();
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  const w = innerWidth,
    h = innerHeight,
    ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  ctx.scale(ratio, ratio);
  const colors = ['#81baf0', '#f49db5', '#a6d3b2', '#f5ce79', '#c6aff0'];
  const pieces = Array.from({ length: Math.min(100, Math.max(16, density)) }, (_, i) => ({
    x: w * (i % 2 ? 0.18 : 0.82),
    y: h * 0.64,
    vx: (Math.random() - 0.5) * w * 0.95,
    vy: -h * (0.45 + Math.random() * 0.5),
    spin: Math.random() * 9,
    size: 5 + Math.random() * 5,
    color: colors[i % colors.length],
  }));
  let frame, started;
  const stop = () => {
    cancelAnimationFrame(frame);
    canvas.remove();
    document.removeEventListener('visibilitychange', hidden);
    if (stopEffect === stop) stopEffect = null;
  };
  const hidden = () => {
    if (document.hidden) stop();
  };
  stopEffect = stop;
  document.addEventListener('visibilitychange', hidden);
  duration = Math.min(5000, Math.max(1000, duration));
  const draw = (now) => {
    started ??= now;
    const elapsed = now - started,
      t = elapsed / 1000;
    ctx.clearRect(0, 0, w, h);
    if (elapsed > duration) return stop();
    ctx.globalAlpha = Math.min(1, (duration - elapsed) / 450);
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x + p.vx * t, p.y + p.vy * t + h * 0.3 * t * t);
      ctx.rotate(p.spin * t);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (0.3 + Math.abs(Math.cos(t * 5))));
      ctx.restore();
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
}

export async function requestCelebration(
  event,
  { page, account, admin = false },
  stillCurrent = () => true,
) {
  if (
    !page ||
    document.hidden ||
    document.documentElement.dataset.motion === 'reduce' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (admin && !account)
  )
    return;
  try {
    const result = await api(
      admin ? '/api/admin/celebrations/claim' : '/api/celebrations/claim',
      'POST',
      { event, page },
    );
    if (!stillCurrent()) return;
    for (const effect of result.items || []) {
      const key = `campus-celebration:${admin ? 'admin' : 'user'}:${account?.id || 'guest'}:${effect.token}`;
      if (remembered.has(key)) continue;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
      } catch {}
      remembered.add(key);
      playCelebration(effect);
      break;
    }
  } catch {
    /* A decorative effect never interrupts a real action. */
  }
}

export function installCelebrations(context, { admin = false } = {}) {
  let pending;
  const check = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (document.querySelector('dialog[open]')) return;
      const before = context();
      if (before.ready === false) return;
      void requestCelebration('page-enter', { ...before, admin }, () => {
        const after = context();
        return before.page === after.page && before.account?.id === after.account?.id;
      });
    }, 350);
  };
  window.addEventListener('hashchange', check);
  document.addEventListener('campus:modal-closed', check);
  document.addEventListener('campus:page-ready', check);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  setInterval(check, 60000);
  check();
}
