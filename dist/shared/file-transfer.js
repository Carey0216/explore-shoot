import { getPreferenceAccountId } from './preferences.js';
// Measured transport progress; never advance a timer to pretend bytes were uploaded.
export function uploadPrivateFile(url, data, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.timeout = 90000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.floor((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let body;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        return reject(Error('上传响应不完整，请重试'));
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(body);
      } else {
        const error = Error(
          body.error ||
            (xhr.status === 401
              ? '登录已过期，文件仍保留，请重新登录原账号'
              : '上传失败，可单独重试'),
        );
        error.status = xhr.status;
        reject(error);
      }
    };
    xhr.onerror = () => reject(Error('网络中断，文件仍保留，可单独重试'));
    xhr.ontimeout = () => reject(Error('上传超时，文件仍保留，可单独重试'));
    xhr.send(JSON.stringify(data));
  });
}
let installed = false;
export function installPrivateDownloads() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', async (event) => {
    const link = event.target.closest?.('a.message-file812');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    const url = new URL(link.href, location.href);
    if (
      url.origin !== location.origin ||
      !/^\/(?:admin\/)?api\/messages\/files\/[a-f0-9-]{36}$/.test(url.pathname)
    )
      return;
    event.preventDefault();
    if (link.dataset.downloading) return;
    link.dataset.downloading = 'true';
    const owner = getPreferenceAccountId(),
      label = link.querySelector('small'),
      name = link.querySelector('strong')?.textContent || '附件';
    label.textContent = '正在下载…';
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok)
        throw Error(
          response.status === 401
            ? '请重新登录原账号，再点此处重试'
            : response.status === 404 || response.status === 410
              ? '附件暂不可用，可重试或联系管理员'
              : '下载失败，点此处重试',
        );
      const reader = response.body.getReader(),
        total = Number(response.headers.get('Content-Length')),
        chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        chunks.push(value);
        if (link.isConnected)
          label.textContent = total
            ? '下载中 ' + Math.min(99, Math.floor((received / total) * 100)) + '%'
            : '已下载 ' + Math.ceil(received / 1024) + ' KB';
      }
      if (!link.isConnected || getPreferenceAccountId() !== owner) return;
      const blob = URL.createObjectURL(new Blob(chunks, { type: 'application/octet-stream' })),
        save = document.createElement('a');
      save.href = blob;
      save.download = name;
      save.click();
      setTimeout(() => URL.revokeObjectURL(blob), 30000);
      label.textContent = '已交给浏览器保存 · 点击可再次下载';
    } catch (error) {
      if (link.isConnected) label.textContent = error.message || '下载中断，点此处重试';
    } finally {
      delete link.dataset.downloading;
    }
  });
}
