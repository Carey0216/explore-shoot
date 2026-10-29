const network = require('./network');
const offline = require('./public-offline');
const KEY = 'explore-mini-session-v1';
let epoch = 0;
const localFiles = new Set();
const retainedFiles = new Map();
const downloads = new Map();
const uploadAttempts = new Map();

function base() {
  return network.backendOrigin();
}
function session() {
  const saved = wx.getStorageSync(KEY) || null;
  // A local test account/token must never be carried over to a different backend.
  if (saved && saved.origin !== network.configuredOrigin()) {
    clearSession();
    return null;
  }
  return saved;
}
function clearSession({ preserveDrafts = false } = {}) {
  epoch++;
  require('./request-cache').clear();
  downloads.clear();
  uploadAttempts.clear();
  if (!preserveDrafts) require('./checkin-draft').clear();
  wx.removeStorageSync(KEY);
  try {
    getApp().globalData.messageAlertsReset?.();
    getApp().globalData.account = null;
    getApp().globalData.unread = 0;
  } catch (_) {}
  for (const file of localFiles) wx.getFileSystemManager().unlink({ filePath: file, fail() {} });
  localFiles.clear();
  retainedFiles.clear();
}
function removeExpiredSession() {
  const current = session();
  if (current && (!/^[a-f0-9]{64}$/.test(current.token) || current.expiresAt <= Date.now()))
    clearSession({ preserveDrafts: true });
}
function saveSession(data) {
  if (!/^[a-f0-9]{64}$/.test(data.token) || !(data.expiresAt > Date.now()))
    throw Error('登录响应无效');
  clearSession({ preserveDrafts: true });
  wx.setStorageSync(KEY, {
    token: data.token,
    expiresAt: data.expiresAt,
    account: data.account,
    origin: base(),
  });
  getApp().globalData.account = data.account;
}
function headers() {
  removeExpiredSession();
  const current = session();
  return current ? { Authorization: `Bearer ${current.token}` } : {};
}
function updateAccount(account) {
  const current = session();
  if (
    current?.account.id === account?.id &&
    Number(current.account.preferencesRevision || 0) > Number(account.preferencesRevision || 0)
  )
    account = {
      ...account,
      preferences: current.account.preferences,
      preferencesRevision: current.account.preferencesRevision,
    };
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
function cached(path, ttl = 30000) {
  const key = base() + ':' + epoch + ':' + path;
  return require('./request-cache').read(key, () => request(path), ttl);
}
function request(path, method = 'GET', data) {
  removeExpiredSession();
  if (path === '/api/media' && method === 'POST' && data?.photo && !data.submissionId) {
    if (!uploadAttempts.has(data.photo)) {
      if (uploadAttempts.size >= 2) uploadAttempts.delete(uploadAttempts.keys().next().value);
      uploadAttempts.set(data.photo, require('./model').uuid());
    }
    data = { ...data, submissionId: uploadAttempts.get(data.photo) };
  }
  if (
    method !== 'GET' &&
    path !== '/api/maps/walking' &&
    !/^\/api\/client-(health|performance)$/.test(path)
  )
    require('./request-cache').clear();
  const measured =
    path === '/api/media' && method === 'POST'
      ? require('./experience-metrics').start?.('upload') || (() => {})
      : null;
  const authHeaders = headers();
  const at = epoch;
  return new Promise((resolve, reject) => {
    wx.request({
      url: base() + apiPath(path),
      method,
      data,
      header: { 'content-type': 'application/json', ...authHeaders },
      timeout:
        path === '/api/media' ||
        path === '/api/messages/files' ||
        path === '/api/localization/translate'
          ? 90000
          : 20000,
      success(res) {
        measured?.(res.statusCode >= 200 && res.statusCode < 300);
        if (at !== epoch) return reject(Error('账号已改变，请重试'));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (
            method !== 'GET' &&
            !/assistant|celebrations|search|maps\/walking|client-(health|performance)|\/view$|impressions|\/read$/.test(
              path,
            )
          )
            getApp().globalData.mutationVersion = (getApp().globalData.mutationVersion || 0) + 1;
          if (path === '/api/features' && res.data.features)
            wx.setStorageSync(
              'campus-mini-offline-enabled',
              res.data.features.offline?.enabled !== false,
            );
          if (method === 'GET') offline.put(path, res.data);
          if (method !== 'GET' && res.data?.passportEvents && session()) {
            const app = getApp(),
              owner = session().account.id,
              receipt = owner + ':' + res.data.id;
            app.globalData.seenPassportReceipt813 ||= new Set();
            if (!app.globalData.seenPassportReceipt813.has(receipt)) {
              app.globalData.seenPassportReceipt813.add(receipt);
              if (app.globalData.seenPassportReceipt813.size > 100)
                app.globalData.seenPassportReceipt813.delete(
                  app.globalData.seenPassportReceipt813.values().next().value,
                );
              app.globalData.pendingPassportRewards = {
                owner,
                origin: network.configuredOrigin(),
                events: res.data.passportEvents,
              };
              setTimeout(() => getCurrentPages().slice(-1)[0]?.presentPendingRewards813?.(), 1000);
            }
          }
          return resolve(res.data);
        }
        if (method === 'GET' && [404, 410].includes(res.statusCode)) offline.remove(path);
        if (res.statusCode === 401) clearSession({ preserveDrafts: true });
        const error = Error(
          res.statusCode === 401
            ? '登录已过期。草稿仍保留在本机，请重新登录原账号后继续。'
            : (res.data && res.data.error) || '请求失败，请稍后重试',
        );
        error.status = res.statusCode;
        reject(error);
      },
      fail(error) {
        measured?.(false);
        const cached = method === 'GET' ? offline.get(path) : null;
        if (cached) return resolve(cached);
        reject(network.failure(error));
      },
    });
  });
}
function asset(path, thumb = true) {
  if (!path) return '';
  // Only same-server assets. Never forward a token to a URL supplied by content.
  if (
    !/^\/(shared\/|media\/|api\/(works|shooting-spots|auth|messages)\/)/.test(path) ||
    path.includes('..') ||
    path.includes('\\')
  )
    return '';
  const url =
    base() + (path.startsWith('/api/') || path.startsWith('/media/') ? apiPath(path) : path);
  return thumb ? url + (url.includes('?') ? '&' : '?') + 'size=thumb' : url;
}
function download(path, thumb = true, onProgress) {
  const url = asset(path, thumb),
    at = epoch;
  if (!url) return Promise.reject(Error('照片不可用'));
  const cached = downloads.get(url);
  if (cached && cached.until > Date.now()) return cached.promise;
  downloads.delete(url);
  const promise = new Promise((resolve, reject) => {
    const task = wx.downloadFile({
      url,
      header: headers(),
      timeout: 25000,
      success(res) {
        if (at !== epoch || res.statusCode !== 200) {
          if (res.tempFilePath)
            wx.getFileSystemManager().unlink({ filePath: res.tempFilePath, fail() {} });
          const error = Error(
            res.statusCode === 401 ? '登录已过期，请重新登录后重试' : '照片不可用',
          );
          error.status = res.statusCode;
          return reject(error);
        }
        localFiles.add(res.tempFilePath);
        const entry = downloads.get(url);
        if (entry) entry.file = res.tempFilePath;
        pruneFiles(res.tempFilePath);
        resolve(res.tempFilePath);
      },
      fail(error) {
        reject(network.failure(error));
      },
    });
    task.onProgressUpdate?.((e) => onProgress?.(e.progress));
  });
  const entry = { promise, until: Date.now() + 60000 };
  downloads.set(url, entry);
  promise.catch(() => {
    if (downloads.get(url) === entry) downloads.delete(url);
  });
  while (downloads.size > 48) downloads.delete(downloads.keys().next().value);
  return promise;
}
// A retained <image> may still be visible when the download cache rolls over.
function forgetFile(file) {
  localFiles.delete(file);
  retainedFiles.delete(file);
  for (const [url, entry] of downloads) if (entry.file === file) downloads.delete(url);
  wx.getFileSystemManager().unlink({ filePath: file, fail() {} });
}
function pruneFiles(skip) {
  for (const file of localFiles) {
    if (localFiles.size <= 64) break;
    if (file !== skip && !retainedFiles.has(file)) forgetFile(file);
  }
}
function retainFile(file) {
  if (localFiles.has(file)) retainedFiles.set(file, (retainedFiles.get(file) || 0) + 1);
}
function releaseFile(file) {
  const count = retainedFiles.get(file) || 0;
  if (count > 1) retainedFiles.set(file, count - 1);
  else retainedFiles.delete(file);
  pruneFiles();
}
function registerFile(file) {
  localFiles.add(file);
}
function identity() {
  return base() + ':' + epoch;
}
function forgetImage(path, thumb = true) {
  downloads.delete(asset(path, thumb));
}
function requireLogin() {
  removeExpiredSession();
  if (session()) return true;
  wx.navigateTo({ url: '/pages/login/index' });
  return false;
}
function message(error) {
  wx.showToast({
    title: String(error?.message || error?.errMsg || error || '请求失败').slice(0, 80),
    icon: 'none',
    duration: 3000,
  });
}
module.exports = {
  uploadMessageFile(filePath, data, onProgress) {
    return require('./private-file-upload').upload(
      module.exports,
      base() + apiPath('/api/messages/files'),
      filePath,
      data,
      onProgress,
      () => clearSession({ preserveDrafts: true }),
    );
  },
  request,
  cached,
  session,
  saveSession,
  updateAccount,
  clearSession,
  removeExpiredSession,
  headers,
  asset,
  download,
  forgetImage,
  retainFile,
  releaseFile,
  registerFile,
  forgetFile,
  identity,
  requireLogin,
  message,
};
