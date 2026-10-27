const network = require('./network');
const PREFIX = 'campus-mini-draft-v7:';
const sealed = new Set();
const dir = () => wx.env.USER_DATA_PATH + '/campus-drafts-v7';
function key(owner, point, spot) {
  return (
    PREFIX + encodeURIComponent(network.configuredOrigin()) + ':' + owner + ':' + point + ':' + spot
  );
}
function remove(owner, point, spot, submissionId) {
  const k = key(owner, point, spot),
    v = wx.getStorageSync(k);
  for (const id of [submissionId, v?.submissionId]) if (id) sealed.add(k + ':' + id);
  while (sealed.size > 200) sealed.delete(sealed.values().next().value);
  for (const entry of v?.photos || [])
    if (entry.path?.startsWith(dir() + '/'))
      wx.getFileSystemManager().unlink({ filePath: entry.path, fail() {} });
  if (v?.photo && v.photo.startsWith(dir() + '/'))
    wx.getFileSystemManager().unlink({ filePath: v.photo, fail() {} });
  wx.removeStorageSync(k);
}
async function save(owner, point, spot, value) {
  const origin = network.configuredOrigin();
  const seal = key(owner, point, spot) + ':' + value.submissionId;
  const valid = () => {
    const session = wx.getStorageSync('explore-mini-session-v1');
    return (
      session?.account?.id === owner &&
      session.origin === origin &&
      network.configuredOrigin() === origin &&
      !sealed.has(seal)
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
  const photos = [];
  try {
    for (const entry of value.photos || []) {
      const previous = old?.photos?.find((p) => p.id === entry.id);
      let path = previous?.source === entry.path ? previous.path : entry.path;
      if (path && !path.startsWith(dir() + '/')) {
        const dest = dir() + '/' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.jpg';
        await new Promise((resolve, reject) =>
          fs.copyFile({ srcPath: path, destPath: dest, success: resolve, fail: reject }),
        );
        path = dest;
      }
      photos.push({ ...entry, source: entry.path, path });
    }
  } catch (error) {
    for (const entry of photos)
      if (!old?.photos?.some((p) => p.path === entry.path))
        fs.unlink({ filePath: entry.path, fail() {} });
    throw error;
  }
  if (!valid()) {
    for (const entry of photos)
      if (!old?.photos?.some((p) => p.path === entry.path))
        fs.unlink({ filePath: entry.path, fail() {} });
    if (photo && photo !== value.photo && photo.startsWith(dir() + '/'))
      fs.unlink({ filePath: photo, fail() {} });
    return;
  }
  try {
    wx.setStorageSync(k, {
      ...value,
      ...(value.photos ? { photos } : {}),
      source: value.photo,
      photo,
      at: Date.now(),
    });
  } catch (error) {
    for (const entry of photos)
      if (!old?.photos?.some((p) => p.path === entry.path) && entry.path?.startsWith(dir() + '/'))
        fs.unlink({ filePath: entry.path, fail() {} });
    if (photo && photo !== old?.photo && photo !== value.photo && photo.startsWith(dir() + '/'))
      fs.unlink({ filePath: photo, fail() {} });
    throw error;
  }
  for (const entry of old?.photos || [])
    if (!photos.some((p) => p.path === entry.path) && entry.path?.startsWith(dir() + '/'))
      fs.unlink({ filePath: entry.path, fail() {} });
  if (old?.photo && old.photo !== photo && old.photo.startsWith(dir() + '/'))
    fs.unlink({ filePath: old.photo, fail() {} });
  return photo;
}
function load(owner, point, spot) {
  const v = wx.getStorageSync(key(owner, point, spot));
  if (v && Date.now() - v.at < 7 * 86400000) {
    if (v.photos)
      v.photos = v.photos.filter((p) => {
        try {
          wx.getFileSystemManager().accessSync(p.path);
          return true;
        } catch {
          return false;
        }
      });
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
    for (const entry of v?.photos || [])
      if (entry.path?.startsWith(dir() + '/'))
        wx.getFileSystemManager().unlink({ filePath: entry.path, fail() {} });
    if (v?.photo?.startsWith(dir() + '/'))
      wx.getFileSystemManager().unlink({ filePath: v.photo, fail() {} });
    wx.removeStorageSync(k);
  }
}
module.exports = { save, load, remove, clear };
