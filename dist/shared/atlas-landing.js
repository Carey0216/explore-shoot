// Start after the actual photo decodes; otherwise first-load animation ends on an empty map.
export function playAtlasLanding(dialog, item) {
  let cancelled = false,
    timer;
  const animations = [];
  const stop = () => {
    cancelled = true;
    clearTimeout(timer);
    animations.forEach((a) => a.cancel());
    document.body.classList.remove('collection-impact813');
    dialog.classList.remove('atlas-celebration813');
  };
  const wanted = new Set(item.buildings.map((b) => b.id));
  dialog.querySelectorAll('[data-atlas-building]').forEach((g) => {
    if (wanted.has(g.dataset.atlasBuilding)) g.style.opacity = '0';
  });
  const replay = async () => {
    document.body.classList.remove('collection-impact813');
    animations.splice(0).forEach((a) => a.cancel());
    clearTimeout(timer);
    const photo = new Image();
    photo.src = item.buildings[0].id.startsWith('photo:')
      ? item.atlas.photoURL
      : item.atlas.planURL;
    try {
      await photo.decode();
    } catch {
      if (!cancelled)
        dialog.querySelector('[data-landing-status]').textContent =
          '地图图片暂未载入，点“重看落位”重试';
      return;
    }
    if (cancelled || !dialog.isConnected) return;
    dialog.querySelector('[data-landing-status]').textContent = item.revisit
      ? '新的足迹已保存，重温这栋建筑的落位'
      : '这栋建筑，因你的打卡而亮起';
    dialog.classList.add('atlas-celebration813');
    const svg = dialog.querySelector('.passport-atlas'),
      box = svg.getBoundingClientRect(),
      photoFrame = item.buildings[0].id.startsWith('photo:');
    const unit = (photoFrame ? item.atlas.photoHeight : 1120) / Math.max(1, box.width);
    const transform = (drop, scale) =>
      `translate(${photoFrame ? -drop * unit : 0}px,${photoFrame ? 0 : drop * unit}px) scale(${scale})`;
    const ids = new Set(item.buildings.map((b) => b.id));
    svg.querySelectorAll('[data-atlas-building]').forEach((g) => {
      g.removeAttribute('tabindex');
      g.removeAttribute('role');
      if (!ids.has(g.dataset.atlasBuilding)) return;
      g.style.opacity = '';
      const building = item.atlas.buildings.find((b) => b.id === g.dataset.atlasBuilding),
        center = building.outline.reduce(
          (p, q) => [p[0] + q[0] / building.outline.length, p[1] + q[1] / building.outline.length],
          [0, 0],
        );
      // Clipped <image> still has the whole panorama's bounds. Its center is NOT the roof center.
      g.style.transformBox = 'view-box';
      g.style.transformOrigin = `${center[0] - (photoFrame ? 0 : 85)}px ${center[1] - (photoFrame ? 0 : 112)}px`;
      animations.push(
        g.animate(
          [
            { opacity: 0.25, transform: transform(-96, 3.2), offset: 0 },
            { opacity: 1, transform: transform(7, 0.9), offset: 0.54 },
            { transform: transform(-3, 1.06), offset: 0.71 },
            { transform: transform(1, 0.98), offset: 0.85 },
            { opacity: 1, transform: 'none', offset: 1 },
          ],
          { duration: 1100, easing: 'linear' },
        ),
      );
    });
    timer = setTimeout(() => {
      if (cancelled || !dialog.isConnected) return;
      document.body.classList.remove('collection-impact813');
      void dialog.offsetWidth;
      document.body.classList.add('collection-impact813');
      dialog.dataset.impactAt = String(performance.now());
      navigator.vibrate?.(18);
      svg.querySelectorAll('[data-atlas-building]').forEach((g) => {
        if (!ids.has(g.dataset.atlasBuilding))
          animations.push(
            g.animate(
              [
                { transform: 'none' },
                { transform: `translate(${3 * unit}px,${-2 * unit}px)` },
                { transform: 'none' },
              ],
              { duration: 400, easing: 'ease-out' },
            ),
          );
      });
    }, 594);
  };
  dialog.querySelector('[data-replay-landing]').onclick = () => void replay();
  void replay();
  return stop;
}
