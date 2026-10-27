function key(id) {
  const api = require('./api');
  return (
    'jingyu-plan-draft813:' +
    require('./network').configuredOrigin() +
    ':' +
    (api.session()?.account.id || 'guest') +
    ':' +
    id
  );
}
function read(id) {
  const v = wx.getStorageSync(key(id));
  return v && Date.now() - v.at < 7 * 86400000 ? v : null;
}
function save(plan) {
  const data = {
    revision: plan.revision,
    at: Date.now(),
    plan: {
      title: plan.title,
      departure: plan.departure || '',
      checklist: plan.checklist || {},
      items: plan.items.map(({ id, spotId, composition, done, minutes = 5 }) => ({
        id,
        spotId,
        composition,
        done,
        minutes,
      })),
    },
  };
  try {
    wx.setStorageSync(key(plan.id), data);
  } catch {
    throw Error('本机存储不足，请保持页面打开后重试保存');
  }
}
function clear(id) {
  wx.removeStorageSync(key(id));
}
module.exports = { read, save, clear };
