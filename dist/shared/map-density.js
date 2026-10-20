// Deterministic screen-space thinning keeps base-map roads and labels readable.
export function visibleMapPoints(points, zoom = 16, { selected = null, routeIds = [] } = {}) {
  const scale = 256 * Math.pow(2, Math.max(1, Math.min(22, Number(zoom) || 16))),
    cells = new Set(),
    routes = new Set(routeIds);
  const limit =
    zoom < 15 ? 14 : zoom < 16 ? 24 : zoom < 17 ? 42 : zoom < 18 ? 72 : zoom < 19 ? 120 : 180;
  const project = (p) => {
    const lat = (Math.max(-85, Math.min(85, p.lat)) * Math.PI) / 180;
    return [
      ((p.lng + 180) / 360) * scale,
      ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * scale,
    ];
  };
  const priority = (p) =>
    p.id === selected ? 0 : routes.has(p.id) ? 1 : p.trust === 'community' ? 3 : 2;
  const result = [];
  for (const p of [...points]
    .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
    .sort((a, b) => priority(a) - priority(b) || String(a.id).localeCompare(String(b.id)))) {
    const [x, y] = project(p),
      key = Math.floor(x / 30) + ':' + Math.floor(y / 30),
      required = p.id === selected || routes.has(p.id);
    if (!required && (cells.has(key) || result.length >= limit)) continue;
    result.push(p);
    cells.add(key);
  }
  return result;
}
export const mapDot = (color, size = 6) =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="${size}" fill="${color}" stroke="white" stroke-width="2"/></svg>`,
  );
