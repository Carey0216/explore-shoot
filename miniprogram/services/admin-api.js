// Separate native administrator audience: never reuse the user's token or cookies.
const network = require('./network');
const KEY = 'explore-mini-admin-session-v1';
let epoch = 0;
const files = new Set();
const uploadAttempts = new Map();
function base() {
  const origin = network.backendOrigin();
  const match = origin.match(/^http:\/\/(127\.0\.0\.1|localhost):(4174|4344|4354|4364)$/);
  return match
    ? origin.replace(/:\d+$/, ':' + (Number(match[2]) + 2)) + '/api/mini/admin'
    : origin + '/admin/api/mini/admin';
}
function clearSession() {
  epoch++;
  uploadAttempts.clear();
  wx.removeStorageSync(KEY);
  for (const f of files) wx.getFileSystemManager().unlink({ filePath: f, fail() {} });
  files.clear();
}
function session() {
  const s = wx.getStorageSync(KEY);
  if (s && (s.origin !== network.configuredOrigin() || s.expiresAt <= Date.now())) {
    clearSession();
    return null;
  }
  return s || null;
}
function saveSession(s) {
  if (!/^[a-f0-9]{64}$/.test(s.token) || !(s.expiresAt > Date.now()))
    throw Error('管理登录响应无效');
  clearSession();
  wx.setStorageSync(KEY, { ...s, origin: network.configuredOrigin() });
}
function headers() {
  const s = session();
  return s ? { Authorization: 'Bearer ' + s.token } : {};
}
function request(path, method = 'GET', data) {
  if (path === '/media' && method === 'POST' && data?.photo && !data.submissionId) {
    if (!uploadAttempts.has(data.photo)) {
      if (uploadAttempts.size >= 2) uploadAttempts.delete(uploadAttempts.keys().next().value);
      uploadAttempts.set(data.photo, require('./model').uuid());
    }
    data = { ...data, submissionId: uploadAttempts.get(data.photo) };
  }
  if (
    !/^\/(auth\/(?:login|me|logout|profile|password|preferences|avatar)|localization|overview|inbox|conversations|announcements|media|users|applications|scout-quiz|points|shooting-spots|works|work-reports|reports|routes|templates|passport|topics|guides|records|audit|knowledge|assistant-status|features|ai-settings|support-settings|site-content|updates|admins|permissions|owner-account|celebrations|campus-map|map-config|settings|metrics|content-deletion|review-queue|preflight|weather|performance)(\/[a-zA-Z0-9._-]+)*$/.test(
      path.split('?')[0],
    )
  )
    throw Error('原生管理接口不支持此操作');
  const auth = headers(),
    at = epoch;
  return new Promise((resolve, reject) =>
    wx.request({
      url: base() + path,
      method,
      data,
      header: { 'content-type': 'application/json', ...auth },
      timeout: path === '/media' || path === '/localization/translate' ? 90000 : 20000,
      success(r) {
        if (at !== epoch) return reject(Error('管理账号已改变，请重新打开'));
        if (r.statusCode >= 200 && r.statusCode < 300) return resolve(r.data);
        if (r.statusCode === 401) clearSession();
        reject(Error(r.data?.error || '管理请求失败'));
      },
      fail(e) {
        reject(network.failure(e));
      },
    }),
  );
}
function download(path, thumb = true) {
  if (
    !/^\/(api\/(?:admin\/(?:works|shooting-spots)|messages\/media|auth\/avatar)|media)(\/[a-f0-9-]+)*(\/photo)?$/.test(
      path.split('?')[0],
    )
  )
    return Promise.reject(Error('管理配图不可用'));
  const tail = path.startsWith('/api/admin/')
    ? path.slice(11)
    : path.startsWith('/api/')
      ? path.slice(5)
      : 'media-file/' + path.slice(7);
  const at = epoch,
    auth = headers();
  return new Promise((resolve, reject) =>
    wx.downloadFile({
      url: base() + '/' + tail + (thumb ? (tail.includes('?') ? '&' : '?') + 'size=thumb' : ''),
      header: auth,
      success(r) {
        if (at !== epoch || r.statusCode !== 200) {
          if (r.tempFilePath)
            wx.getFileSystemManager().unlink({ filePath: r.tempFilePath, fail() {} });
          return reject(Error('管理配图不可用'));
        }
        files.add(r.tempFilePath);
        resolve(r.tempFilePath);
      },
      fail: (e) => reject(network.failure(e)),
    }),
  );
}
function updateAccount(account) {
  const s = session();
  if (
    s?.account.id === account?.id &&
    Number(s.account.preferencesRevision || 0) > Number(account.preferencesRevision || 0)
  )
    account = {
      ...account,
      preferences: s.account.preferences,
      preferencesRevision: s.account.preferencesRevision,
    };
  if (s) wx.setStorageSync(KEY, { ...s, account });
}
module.exports = { request, session, saveSession, updateAccount, clearSession, download };
