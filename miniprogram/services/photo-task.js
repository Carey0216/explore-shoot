const api = require('./api');
function key() {
  return (
    'jingyu-photo-task81:' +
    require('./network').configuredOrigin() +
    ':' +
    (api.session()?.account.id || 'guest')
  );
}
function get() {
  const value = wx.getStorageSync(key());
  return value && Date.now() - value.updatedAt < 86400000 ? value : null;
}
function set(spot, stage) {
  const old = get(),
    next = {
      spotId: spot.id,
      pointId: spot.pointId,
      title: spot.title,
      stage,
      updatedAt: Date.now(),
      source: old?.spotId === spot.id ? old.source : '',
    };
  wx.setStorageSync(key(), next);
  return next;
}
function clear() {
  wx.removeStorageSync(key());
}
module.exports = { get, set, clear };
