// Shared image-pixel mapping for the collection view and the owner editor.
function dimensions(atlas, frame) {
  return frame === 'photo' ? [atlas.photoHeight, atlas.photoWidth] : [1120, 466];
}
function display(point, atlas, frame) {
  return frame === 'photo'
    ? [point[1], atlas.photoWidth - point[0]]
    : [point[0] - 85, point[1] - 112];
}
function source(point, atlas, frame) {
  const p =
    frame === 'photo' ? [atlas.photoWidth - point[1], point[0]] : [point[0] + 85, point[1] + 112];
  return p.map(
    (v, i) =>
      Math.round(
        Math.max(
          0,
          Math.min(
            v,
            frame === 'photo'
              ? [atlas.photoWidth, atlas.photoHeight][i]
              : [atlas.planWidth, atlas.planHeight][i],
          ),
        ) * 100,
      ) / 100,
  );
}
function contains(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function hit(atlas, frame, x, y, width) {
  const size = dimensions(atlas, frame),
    p = source([(x * size[0]) / width, (y * size[0]) / width], atlas, frame);
  return atlas.buildings
    .filter((b) => b.frame === frame)
    .find((b) => contains(p, b.outline) && !(b.holes || []).some((h) => contains(p, h)));
}
module.exports = { dimensions, display, source, contains, hit };
