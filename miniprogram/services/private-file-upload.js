// Native binary transport exposes measured byte progress; API ownership and idempotency stay server-side.
function upload(api, url, filePath, data, onProgress = () => {}, clearExpired = () => {}) {
  const token = api.session()?.token,
    origin = require('./network').configuredOrigin();
  if (!token) return Promise.reject(Error('登录已过期，文件仍保留，请重新登录原账号'));
  return new Promise((resolve, reject) => {
    const alive = () =>
      api.session()?.token === token && require('./network').configuredOrigin() === origin;
    const task = wx.uploadFile({
      url,
      filePath,
      name: 'file',
      formData: data,
      header: { Authorization: 'Bearer ' + token },
      timeout: 90000,
      success(r) {
        if (!alive()) return reject(Error('账号已改变，请重新打开对话'));
        let body;
        try {
          body = JSON.parse(r.data);
        } catch {
          return reject(Error('上传响应不完整，文件已保留，请重试'));
        }
        if (r.statusCode >= 200 && r.statusCode < 300) {
          onProgress(100);
          resolve(body);
        } else {
          if (r.statusCode === 401) clearExpired();
          const error = Error(body.error || '上传失败，文件已保留，可单独重试');
          error.status = r.statusCode;
          reject(error);
        }
      },
      fail(e) {
        reject(
          Error(
            /timeout/i.test(e.errMsg || '')
              ? '上传超时，文件已保留，可单独重试'
              : '网络中断，文件已保留，可单独重试',
          ),
        );
      },
    });
    task.onProgressUpdate?.((e) => {
      if (alive()) onProgress(Math.min(99, Math.max(0, e.progress || 0)));
      else task.abort?.();
    });
  });
}
module.exports = { upload };
