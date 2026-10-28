import { render, impactAt, duration, bounds } from './collection-cinema.js';
// A full-viewport foreground plane: neither a dialog nor a map card clips the opening shot.
export function playAtlasLanding(dialog, item) {
  let cancelled = false,
    frame,
    serial = 0,
    photo,
    photoReady,
    currentTick;
  const canvas = document.createElement('canvas');
  canvas.className = 'collection-cinema814';
  canvas.setAttribute('aria-hidden', 'true');
  dialog.prepend(canvas);
  dialog.classList.add('collection-fullscreen814');
  const cache = { surface: document.createElement('canvas') };
  const measure = () => {
    const host = document.querySelector?.('.app-shell')?.getBoundingClientRect();
    const b = bounds(
      window.innerWidth || dialog.clientWidth,
      window.visualViewport?.height || window.innerHeight || dialog.clientHeight,
      host,
    );
    dialog.style.setProperty('--collection-window-width', b.width + 'px');
    dialog.style.setProperty('--collection-window-height', b.height + 'px');
    dialog.style.setProperty('--collection-window-left', b.left + 'px');
  };
  measure();
  const clearImpact = () =>
    document.body.classList.remove('collection-impact813', 'collection-impact814');
  const replay = async () => {
    const run = ++serial;
    cancelAnimationFrame(frame);
    clearImpact();
    dialog.classList.remove('collection-landed814');
    const status = dialog.querySelector('[data-landing-status]');
    status.textContent = '正在准备建筑落位…';
    try {
      if (!photoReady) {
        photo = new Image();
        photo.src = item.buildings[0].id.startsWith('photo:')
          ? item.atlas.photoURL
          : item.atlas.planURL;
        photoReady = photo.decode().catch((e) => {
          photoReady = null;
          throw e;
        });
      }
      await photoReady;
    } catch {
      if (!cancelled && run === serial) {
        status.textContent = '地图图片暂未载入，点“重看落位”重试';
        dialog.classList.add('collection-landed814');
      }
      return;
    }
    if (cancelled || run !== serial || !dialog.isConnected) return;
    const ids = item.buildings.map((b) => b.id),
      start = performance.now();
    let impacted = false;
    const tick = (now) => {
      if (cancelled || run !== serial || !dialog.isConnected) return;
      const elapsed = now - start,
        w = dialog.clientWidth,
        h = dialog.clientHeight;
      const result = render(
        canvas,
        photo,
        item.atlas,
        ids,
        w,
        h,
        window.devicePixelRatio,
        elapsed,
        cache,
      );
      if (result) {
        dialog.style.setProperty(
          '--collection-result-top',
          Math.min(h - 210, result.layout.map.y + result.layout.map.height + 24) + 'px',
        );
        dialog.dataset.cinemaElapsed = String(Math.round(elapsed));
        dialog.dataset.cinemaScale = String(result.pose.scale);
        dialog.dataset.cinemaCover = String(result.layout.startScale);
      }
      if (elapsed >= impactAt && !impacted) {
        impacted = true;
        document.body.classList.add('collection-impact814');
        dialog.dataset.impactAt = String(now);
        navigator.vibrate?.([35, 45, 20]);
        status.textContent = item.revisit
          ? '新的足迹已保存，重温这栋建筑的落位'
          : '这栋建筑，因你的打卡而亮起';
      }
      if (elapsed >= impactAt + 240) dialog.classList.add('collection-landed814');
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else clearImpact();
    };
    currentTick = tick;
    frame = requestAnimationFrame(tick);
  };
  dialog.querySelector('[data-replay-landing]').onclick = () => void replay();
  const resize = () => {
    measure();
    if (currentTick) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(currentTick);
    }
  };
  window.addEventListener('resize', resize);
  void replay();
  return () => {
    cancelled = true;
    serial++;
    cancelAnimationFrame(frame);
    clearImpact();
    window.removeEventListener('resize', resize);
    canvas.remove();
    dialog.classList.remove('collection-fullscreen814', 'collection-landed814');
  };
}
