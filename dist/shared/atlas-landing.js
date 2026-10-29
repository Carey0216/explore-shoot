import { render, impactAt, duration, bounds } from './collection-cinema.js';
import { collectionImpact } from './collection-impact.js';
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
  const impact = collectionImpact(dialog);
  const cache = {
    surface: document.createElement('canvas'),
    frameSurface: document.createElement('canvas'),
  };
  let geometry;
  const measure = () => {
    const host = document.querySelector?.('.app-shell')?.getBoundingClientRect();
    const b = bounds(
      window.innerWidth || dialog.clientWidth,
      window.visualViewport?.height || window.innerHeight || dialog.clientHeight,
      host,
    );
    if (
      geometry &&
      Math.abs(b.width - geometry.width) < 1 &&
      Math.abs(b.left - geometry.left) < 1 &&
      (window.innerWidth > 600
        ? Math.abs(b.height - geometry.height) < 1
        : Math.abs(b.height - geometry.height) < 120)
    )
      return false;
    geometry = b;
    dialog.style.setProperty('--collection-window-width', b.width + 'px');
    dialog.style.setProperty('--collection-window-height', b.height + 'px');
    dialog.style.setProperty('--collection-window-left', b.left + 'px');
    return true;
  };
  measure();
  const clearImpact = impact.clear;
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
    const measured = globalThis.jingyuExperience820?.start('landing') || (() => {});
    let impacted = false,
      previous = start,
      gaps = 0,
      ticks = 0;
    const tick = (now) => {
      if (cancelled || run !== serial || !dialog.isConnected) return;
      const elapsed = now - start,
        w = dialog.clientWidth,
        h = dialog.clientHeight;
      if (now - previous > 34) gaps++;
      previous = now;
      ticks++;
      let result;
      try {
        result = render(
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
        if (!result) throw Error('No renderable building');
      } catch {
        measured(false);
        clearImpact();
        status.textContent = '建筑画面暂不可用，点“重看落位”重试';
        dialog.classList.add('collection-landed814');
        return;
      }
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
        impact.play();
        dialog.dataset.impactAt = String(now);
        try {
          navigator.vibrate?.([35, 45, 20]);
        } catch {
          /* Visual feedback is independent of haptic support. */
        }
        status.textContent = item.revisit
          ? '新的足迹已保存，重温这栋建筑的落位'
          : '这栋建筑，因你的打卡而亮起';
      }
      if (elapsed >= impactAt + 240) dialog.classList.add('collection-landed814');
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else {
        clearImpact();
        measured(true, { dropped: gaps / Math.max(1, ticks) });
      }
    };
    currentTick = tick;
    frame = requestAnimationFrame(tick);
  };
  dialog.querySelector('[data-replay-landing]').onclick = () => void replay();
  const resize = () => {
    if (!measure()) return;
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
    impact.dispose();
    dialog.classList.remove('collection-fullscreen814', 'collection-landed814');
  };
}
