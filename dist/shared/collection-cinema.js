// One viewport-space choreography for both clients. The flying roof is never clipped to a card.
import * as atlasPainter from './atlas-painter.js';
const impactAt = 1240,
  duration = 2400;
function bounds(width, height, host) {
  const w = Math.max(
    1,
    Math.min(width, width <= 600 ? width : host?.width > 0 ? host.width : width),
  );
  return {
    width: w,
    height: Math.max(1, height),
    left: Math.max(0, Math.min(width - w, host?.left || 0)),
  };
}
function layout(width, height, atlas, building) {
  const photo = building.frame === 'photo',
    sourceW = photo ? atlas.photoWidth : atlas.planWidth,
    sourceH = photo ? atlas.photoHeight : atlas.planHeight;
  const worldW = photo ? sourceH : 1120,
    worldH = photo ? sourceW : 466;
  const mapW = Math.min(width - 32, 1000, height * 1.3),
    mapH = (mapW * worldH) / worldW;
  const map = {
    x: (width - mapW) / 2,
    y: Math.max(90, Math.min(height * 0.29, height - 340 - mapH)),
    width: mapW,
    height: mapH,
  };
  const project = ([x, y]) =>
    photo
      ? [map.x + (y * mapW) / worldW, map.y + ((sourceW - x) * mapW) / worldW]
      : [map.x + ((x - 85) * mapW) / worldW, map.y + ((y - 112) * mapW) / worldW];
  const points = building.outline.map(project),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // COVER, not contain: even a small/long roof fills both dimensions of the viewport at the opening.
  const startScale = Math.max(
    (width * 1.2) / Math.max(1, box.width),
    (height * 1.2) / Math.max(1, box.height),
  );
  return {
    width,
    height,
    map,
    box,
    target,
    startScale,
    sourceW,
    sourceH,
    worldW,
    worldH,
    photo,
    sourceCenter: photo
      ? [sourceW - ((target.y - map.y) * worldW) / mapW, ((target.x - map.x) * worldW) / mapW]
      : [((target.x - map.x) * worldW) / mapW + 85, ((target.y - map.y) * worldW) / mapW + 112],
  };
}
function pose(elapsed, l) {
  const ms = Math.max(0, elapsed);
  if (ms >= duration)
    return {
      scale: 1,
      x: l.target.x,
      y: l.target.y,
      rotation: 0,
      squash: 1,
      landed: true,
      shake: 0,
    };
  if (ms < impactAt) {
    const p = Math.max(0, Math.min(1, (ms - 440) / (impactAt - 440))),
      fall = Math.pow(p, 3.2),
      hold = Math.min(1, ms / 440);
    return {
      scale: l.startScale * (1 + 0.045 * hold) * (1 - fall) + fall,
      x: (l.width / 2) * (1 - fall) + l.target.x * fall,
      y: (l.height / 2 - 24 * hold) * (1 - fall) + l.target.y * fall,
      rotation: -0.045 * (1 - fall),
      squash: 1,
      landed: false,
      shake: 0,
    };
  }
  const u = ms - impactAt,
    envelope = Math.exp(-u / 260),
    wave = Math.sin(u / 45);
  return {
    scale: 1 + 0.13 * envelope * Math.sin(u / 75),
    x: l.target.x,
    y: l.target.y + 10 * envelope * wave,
    rotation: 0,
    squash: 1 - 0.24 * Math.exp(-u / 160) * Math.cos(u / 60),
    landed: true,
    shake: Math.sin(u / 25) * Math.exp(-u / 260) * 30,
  };
}
function renderFrame(canvas, image, atlas, ids, width, height, pixelRatio, elapsed, cache = {}) {
  const building = atlas.buildings.find((b) => ids.includes(b.id));
  if (!building) return null;
  const l = layout(width, height, atlas, building),
    ratio = Math.min(2, pixelRatio || 1);
  if (
    cache.image !== image ||
    cache.width !== width ||
    cache.height !== height ||
    cache.key !== ids.join(',')
  ) {
    const surface = cache.surface || canvas;
    atlasPainter.draw(surface, image, atlas, building.frame, l.map.width, ratio, {
      ids,
      pose: { alpha: 0, scale: 1, drop: 0 },
    });
    cache.buffer = surface !== canvas ? surface : null;
    cache.pixels = cache.buffer
      ? null
      : surface.getContext('2d').getImageData(0, 0, surface.width, surface.height);
    cache.pixelFallback = false;
    Object.assign(cache, { image, width, height, key: ids.join(',') });
  }
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d'),
    p = pose(elapsed, l);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mapX = Math.round((l.map.x + p.shake * 0.6) * ratio),
    mapY = Math.round((l.map.y + p.shake) * ratio);
  // Composite the retained surface directly. Repeated pixel readbacks stall native UI delivery.
  if (cache.buffer && !cache.pixelFallback) {
    try {
      ctx.drawImage(cache.buffer, mapX, mapY);
    } catch {
      cache.pixelFallback = true;
      cache.pixels = cache.buffer
        .getContext('2d')
        .getImageData(0, 0, cache.buffer.width, cache.buffer.height);
    }
  }
  if (!cache.buffer || cache.pixelFallback) ctx.putImageData(cache.pixels, mapX, mapY);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (p.landed) {
    const q = Math.min(1, (elapsed - impactAt) / 700);
    ctx.save();
    ctx.translate(l.target.x, l.target.y);
    ctx.scale(1, 0.36);
    ctx.beginPath();
    ctx.arc(0, 0, 24 + q * Math.min(width, 500), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(229,172,74,${0.8 * (1 - q)})`;
    ctx.lineWidth = 4 * (1 - q) + 1;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.scale(p.scale * (2 - p.squash), p.scale * p.squash);
  const factor = l.map.width / l.worldW;
  ctx.scale(factor, factor);
  if (l.photo) ctx.rotate(-Math.PI / 2);
  ctx.translate(-l.sourceCenter[0], -l.sourceCenter[1]);
  for (const b of atlas.buildings.filter((b) => ids.includes(b.id) && b.frame === building.frame)) {
    ctx.save();
    atlasPainter.path(ctx, b);
    ctx.clip();
    ctx.drawImage(image, 0, 0, l.sourceW, l.sourceH);
    ctx.restore();
    atlasPainter.path(ctx, b);
    ctx.strokeStyle = '#e6ae42';
    ctx.lineWidth = 1.7 / factor / Math.max(1, p.scale);
    ctx.stroke();
  }
  ctx.restore();
  return { layout: l, pose: p, elapsed };
}
// Complete a frame away from the visible surface, then present it in one copy operation.
// Clearing a visible full-screen layer first can expose a white compositor frame on mobile WebKit.
function render(canvas, image, atlas, ids, width, height, pixelRatio, elapsed, cache = {}) {
  const buffer = cache.frameSurface;
  if (!buffer || cache.atomicUnavailable)
    return renderFrame(canvas, image, atlas, ids, width, height, pixelRatio, elapsed, cache);
  const frame = renderFrame(buffer, image, atlas, ids, width, height, pixelRatio, elapsed, cache);
  if (!frame) return null;
  // Prepare before resizing the visible backing store, including on real orientation changes.
  if (canvas.width !== buffer.width) canvas.width = buffer.width;
  if (canvas.height !== buffer.height) canvas.height = buffer.height;
  const context = canvas.getContext('2d');
  context.save();
  let unavailable = false;
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'copy';
    if (context.globalCompositeOperation !== 'copy') throw Error('Atomic canvas copy unavailable');
    context.drawImage(buffer, 0, 0);
  } catch {
    cache.atomicUnavailable = true;
    unavailable = true;
  } finally {
    context.restore();
  }
  if (unavailable)
    return renderFrame(canvas, image, atlas, ids, width, height, pixelRatio, elapsed, cache);
  return frame;
}
export { impactAt, duration, bounds, layout, pose, render };
