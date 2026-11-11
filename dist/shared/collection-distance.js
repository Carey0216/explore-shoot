// WGS84 is used on both clients. The sensor position stays on the device.
export function nearestCollectionBuilding(candidates, lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const radians = Math.PI / 180;
  let nearest = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.lng) || !Number.isFinite(candidate.lat)) continue;
    const north = (candidate.lat - lat) * radians;
    const east = (candidate.lng - lng) * radians * Math.cos(((lat + candidate.lat) * radians) / 2);
    const metres = Math.round(6371000 * Math.hypot(north, east));
    if (!nearest || metres < nearest.metres) nearest = { ...candidate, metres };
  }
  return nearest;
}
