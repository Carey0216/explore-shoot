const network = require('./network');
const KEY = 'campus-mini-public-v7';
const TTL = 7 * 86400000;
function snapshot(path, data) {
  const keys = [
    'id',
    'pointId',
    'name',
    'title',
    'theme',
    'description',
    'cover',
    'lng',
    'lat',
    'open',
    'published',
    'trust',
    'standDescription',
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
  const pick = (x) =>
    Object.fromEntries(keys.filter((k) => x[k] !== undefined).map((k) => [k, x[k]]));
  if (path === '/api/catalog')
    return {
      campus: data.campus,
      points: (data.points || [])
        .map(pick)
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      templates: [],
    };
  if (/^\/api\/shooting-spots\/[a-f0-9-]{36}$/.test(path)) return pick(data);
  if (/^\/api\/points\/[a-z0-9-]+\/shooting-spots$/.test(path))
    return { spots: (data.spots || []).map(pick) };
  return null;
}
function read() {
  try {
    const b = wx.getStorageSync(KEY);
    return b && b.origin === network.configuredOrigin()
      ? b
      : { origin: network.configuredOrigin(), items: {} };
  } catch (_) {
    return { origin: network.configuredOrigin(), items: {} };
  }
}
function put(path, data) {
  if (wx.getStorageSync('campus-mini-offline-enabled') === false) return;
  const safe = snapshot(path, data);
  if (!safe) return;
  try {
    const b = read();
    b.items[path] = { at: Date.now(), data: safe };
    const keys = Object.keys(b.items).sort((a, c) => b.items[a].at - b.items[c].at);
    for (const k of keys)
      if (b.items[k].at < Date.now() - TTL || Object.keys(b.items).length > 100) delete b.items[k];
    wx.setStorageSync(KEY, b);
  } catch (_) {}
}
function get(path) {
  if (wx.getStorageSync('campus-mini-offline-enabled') === false) return null;
  try {
    const v = read().items[path];
    if (v && Date.now() - v.at < TTL && Date.now() >= v.at)
      return { ...v.data, _offline: true, _cachedAt: v.at };
  } catch (_) {}
  return null;
}
function remove(path) {
  try {
    const b = read();
    delete b.items[path];
    wx.setStorageSync(KEY, b);
  } catch (_) {}
}
module.exports = { put, get, remove, snapshot };
