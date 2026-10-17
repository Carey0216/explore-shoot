// Bounded, text-only public snapshots. No credentials, reactions, private records or photos.
const PREFIX = 'campus-public-v7:';
const TTL = 7 * 86400000;
const pointKeys = [
  'id',
  'name',
  'theme',
  'description',
  'cover',
  'lng',
  'lat',
  'open',
  'published',
  'trust',
  'address',
];
const spotKeys = [
  'id',
  'pointId',
  'title',
  'standDescription',
  'lng',
  'lat',
  'bearing',
  'heightMeters',
  'heightAdvice',
  'bestTime',
  'conditions',
  'openingHours',
  'accessNotice',
  'availability',
  'status',
  'revision',
  'photo',
];
const pick = (value, keys) =>
  Object.fromEntries(keys.filter((k) => value?.[k] !== undefined).map((k) => [k, value[k]]));
export function publicSnapshot(path, value) {
  if (path === '/api/catalog')
    return {
      campus: value.campus,
      points: (value.points || [])
        .map((p) => pick(p, pointKeys))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      templates: [],
    };
  if (/^\/api\/shooting-spots\/[a-f0-9-]{36}$/.test(path)) return pick(value, spotKeys);
  if (/^\/api\/points\/[a-z0-9-]+\/shooting-spots$/.test(path))
    return { spots: (value.spots || []).map((s) => pick(s, spotKeys)) };
  return null;
}
export function cachePublic(path, value, storage = undefined, now = Date.now()) {
  const data = publicSnapshot(path, value);
  if (!data) return;
  try {
    storage ||= globalThis.localStorage;
    if (storage.getItem('campus-offline-enabled') === 'false') return null;
    storage.setItem(PREFIX + path, JSON.stringify({ at: now, data }));
    const keys = Object.keys(storage).filter((k) => k.startsWith(PREFIX));
    const sorted = keys
      .map((k) => [k, JSON.parse(storage.getItem(k)).at])
      .sort((a, b) => a[1] - b[1]);
    for (const [key, at] of sorted)
      if (at < now - TTL || keys.length > 100) {
        storage.removeItem(key);
        keys.pop();
      }
  } catch {
    /* Full/disabled storage must never break online browsing. */
  }
}
export function cachedPublic(path, storage = undefined, now = Date.now()) {
  try {
    storage ||= globalThis.localStorage;
    if (storage.getItem('campus-offline-enabled') === 'false') return null;
    const saved = JSON.parse(storage.getItem(PREFIX + path));
    if (saved && now - saved.at < TTL && now >= saved.at)
      return { ...saved.data, _offline: true, _cachedAt: saved.at };
    storage.removeItem(PREFIX + path);
  } catch {}
  return null;
}
export function forgetPublic(path, storage = undefined) {
  try {
    storage ||= globalThis.localStorage;
    if (storage.getItem('campus-offline-enabled') === 'false') return null;
    storage.removeItem(PREFIX + path);
  } catch {}
}
