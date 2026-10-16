const config = require('../config');
const KEY = 'explore-mini-session-v1';
let epoch = 0;
const localFiles = new Set();

function base() {
  const value = String(config.apiBase || '').replace(/\/$/, '');
  if (
    !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value) &&
    !(config.development && /^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/.test(value))
  ) {
    throw Error('请先在 config.local.js 配置后端地址');
  }
  return value;
}
function session() {
  return wx.getStorageSync(KEY) || null;
}
function clearSession() {
  epoch++;
  wx.removeStorageSync(KEY);
  try {
    getApp().globalData.account = null;
  } catch (_) {}
  for (const file of localFiles) wx.getFileSystemManager().unlink({ filePath: file, fail() {} });
  localFiles.clear();
}
function removeExpiredSession() {
  const current = session();
  if (current && (!/^[a-f0-9]{64}$/.test(current.token) || current.expiresAt <= Date.now()))
    clearSession();
}
function saveSession(data) {
  if (!/^[a-f0-9]{64}$/.test(data.token) || !(data.expiresAt > Date.now()))
    throw Error('登录响应无效');
  clearSession();
  wx.setStorageSync(KEY, { token: data.token, expiresAt: data.expiresAt, account: data.account });
  getApp().globalData.account = data.account;
}
function headers() {
  removeExpiredSession();
  const current = session();
  return current ? { Authorization: `Bearer ${current.token}` } : {};
}
function updateAccount(account) {
  const current = session();
  if (current) {
    current.account = account;
    wx.setStorageSync(KEY, current);
  }
  getApp().globalData.account = account;
}
function apiPath(path) {
  if (path.startsWith('/media/')) return '/api/mini/media-file/' + path.slice(7);
  if (!path.startsWith('/api/') || path.startsWith('/api/admin')) throw Error('接口路径不允许');
  return path.startsWith('/api/mini/') ? path : '/api/mini/' + path.slice(5);
}
function request(path, method = 'GET', data) {
  const authHeaders = headers();
  const at = epoch;
  return new Promise((resolve, reject) => {
    wx.request({
      url: base() + apiPath(path),
      method,
      data,
      header: { 'content-type': 'application/json', ...authHeaders },
      timeout: 20000,
      success(res) {
        if (at !== epoch) return reject(Error('账号已改变，请重试'));
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
        if (res.statusCode === 401) clearSession();
        const error = Error((res.data && res.data.error) || '请求失败，请稍后重试');
        error.status = res.statusCode;
        reject(error);
      },
      fail() {
        reject(Error('连接失败，请检查网络和后端地址'));
      },
    });
  });
}
function asset(path, thumb = true) {
  if (!path) return '';
  // Only same-server assets. Never forward a token to a URL supplied by content.
  if (
    !/^\/(shared\/|media\/|api\/(works|shooting-spots|auth)\/)/.test(path) ||
    path.includes('..') ||
    path.includes('\\')
  )
    return '';
  const url =
    base() + (path.startsWith('/api/') || path.startsWith('/media/') ? apiPath(path) : path);
  return thumb ? url + (url.includes('?') ? '&' : '?') + 'size=thumb' : url;
}
function download(path, thumb = true) {
  const url = asset(path, thumb),
    at = epoch;
  if (!url) return Promise.reject(Error('照片不可用'));
  return new Promise((resolve, reject) =>
    wx.downloadFile({
      url,
      header: headers(),
      timeout: 25000,
      success(res) {
        if (at !== epoch || res.statusCode !== 200) {
          if (res.tempFilePath)
            wx.getFileSystemManager().unlink({ filePath: res.tempFilePath, fail() {} });
          return reject(Error('照片不可用'));
        }
        localFiles.add(res.tempFilePath);
        resolve(res.tempFilePath);
      },
      fail() {
        reject(Error('照片加载失败'));
      },
    }),
  );
}
function requireLogin() {
  removeExpiredSession();
  if (session()) return true;
  wx.navigateTo({ url: '/pages/login/index' });
  return false;
}
function message(error) {
  wx.showToast({ title: (error.message || error).slice(0, 80), icon: 'none', duration: 3000 });
}
module.exports = {
  request,
  session,
  saveSession,
  updateAccount,
  clearSession,
  removeExpiredSession,
  headers,
  asset,
  download,
  requireLogin,
  message,
};
