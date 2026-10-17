const network = require('./network');
const PREFIX = 'campus-mini-draft-v7:';
const dir = () => wx.env.USER_DATA_PATH + '/campus-drafts-v7';
function key(owner, point, spot) {
  return (
    PREFIX + encodeURIComponent(network.configuredOrigin()) + ':' + owner + ':' + point + ':' + spot
  );
}
function remove(owner, point, spot) {
  const k = key(owner, point, spot),
    v = wx.getStorageSync(k);
  if (v?.photo && v.photo.startsWith(dir() + '/'))
    wx.getFileSystemManager().unlink({ filePath: v.photo, fail() {} });
  wx.removeStorageSync(k);
}
async function save(owner, point, spot, value) {
  const origin = network.configuredOrigin();
  const valid = () => {
    const session = wx.getStorageSync('explore-mini-session-v1');
    return (
      session?.account?.id === owner &&
      session.origin === origin &&
      network.configuredOrigin() === origin
    );
  };
  if (!owner || !valid()) return;
  const fs = wx.getFileSystemManager();
  try {
    fs.mkdirSync(dir(), true);
  } catch (_) {}
  const k = key(owner, point, spot),
    old = wx.getStorageSync(k);
  let photo = old?.source === value.photo && old?.photo ? old.photo : value.photo || '';
  if (photo && !photo.startsWith(dir() + '/')) {
    const dest = dir() + '/' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.jpg';
    await new Promise((resolve, reject) =>
      fs.copyFile({ srcPath: photo, destPath: dest, success: resolve, fail: reject }),
    );
    photo = dest;
  }
  if (!valid()) {
    if (photo && photo !== value.photo && photo.startsWith(dir() + '/'))
      fs.unlink({ filePath: photo, fail() {} });
    return;
  }
  wx.setStorageSync(k, { ...value, source: value.photo, photo, at: Date.now() });
  if (old?.photo && old.photo !== photo && old.photo.startsWith(dir() + '/'))
    fs.unlink({ filePath: old.photo, fail() {} });
  return photo;
}
function load(owner, point, spot) {
  const v = wx.getStorageSync(key(owner, point, spot));
  if (v && Date.now() - v.at < 7 * 86400000) {
    if (v.photo) {
      try {
        wx.getFileSystemManager().accessSync(v.photo);
      } catch (_) {
        v.photo = '';
      }
    }
    return v;
  }
  remove(owner, point, spot);
  return null;
}
function clear() {
  const keys = wx.getStorageInfoSync().keys.filter((k) => k.startsWith(PREFIX));
  for (const k of keys) {
    const v = wx.getStorageSync(k);
    if (v?.photo?.startsWith(dir() + '/'))
      wx.getFileSystemManager().unlink({ filePath: v.photo, fail() {} });
    wx.removeStorageSync(k);
  }
}
module.exports = { save, load, remove, clear };
