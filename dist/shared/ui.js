export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const date = (s) =>
  s
    ? new Date(s).toLocaleString(
        typeof document === 'undefined' ? 'zh-CN' : document.documentElement?.lang || 'zh-CN',
        { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      )
    : '—';
export function parseResponse(raw, status) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw Error(
      status >= 500 ? '服务连接暂时中断，请稍后重试。' : '服务返回内容异常，请刷新页面后重试。',
    );
  }
  if (status < 200 || status >= 300) {
    const e = new Error(body?.error || '请求失败，请重试');
    e.status = status;
    throw e;
  }
  return body;
}
const publicOffline = () => import('/shared/public-offline.js').catch(() => null);
export async function api(url, method = 'GET', data) {
  const mediaUpload = url === '/api/media' && method === 'POST' && data?.photo;
  if (mediaUpload && !data.submissionId) {
    if (!uploadAttempts.has(data.photo)) {
      if (uploadAttempts.size >= 8) uploadAttempts.delete(uploadAttempts.keys().next().value);
      uploadAttempts.set(data.photo, crypto.randomUUID());
    }
    data = { ...data, submissionId: uploadAttempts.get(data.photo) };
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
      ...(globalThis.AbortSignal?.timeout
        ? {
            signal: AbortSignal.timeout(
              mediaUpload || /\/(assistant\/query|localization\/translate)/.test(url)
                ? 90000
                : 20000,
            ),
          }
        : {}),
    });
  } catch {
    if (method === 'GET') {
      const cached = (await publicOffline())?.cachedPublic(url);
      if (cached) return cached;
    }
    if (!url.includes('client-health'))
      void import('./client-health.js').then((m) => m.reportClientFailure('network-failed'));
    throw Error('网络连接中断，请检查网络后重试。');
  }
  let raw;
  try {
    raw = await res.text();
  } catch {
    if (method === 'GET') {
      const cached = (await publicOffline())?.cachedPublic(url);
      if (cached) return cached;
    }
    if (!url.includes('client-health'))
      void import('./client-health.js').then((m) => m.reportClientFailure('network-failed'));
    throw Error('网络连接中断，请检查网络后重试。');
  }
  if (method === 'GET' && [404, 410].includes(res.status))
    (await publicOffline())?.forgetPublic(url);
  const result = parseResponse(raw, res.status);
  if (method === 'GET') (await publicOffline())?.cachePublic(url, result);
  return result;
}
export const icons = {
  bell: '<path d="M5 17V9a7 7 0 0 1 14 0v8l2 2H3zM10 22h4"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  send: '<path d="m3 3 19 9-19 9 4-9zM7 12h15"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  message: '<path d="M5 17V9a7 7 0 0 1 14 0v8l2 2H3zM10 22h4"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  walk: '<circle cx="14" cy="4" r="2"/><path d="m7 12 3-4 4 1 3 4h3M12 10l-2 6-4 4M11 15l5 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  'thumb-up':
    '<path d="M7 10v11H3V10zM7 10l5-8a3 3 0 0 1 2 4l-1 4h6a2 2 0 0 1 2 2l-2 7a3 3 0 0 1-3 2H7"/>',
  'thumb-down':
    '<g transform="rotate(180 12 12)"><path d="M7 10v11H3V10zM7 10l5-8a3 3 0 0 1 2 4l-1 4h6a2 2 0 0 1 2 2l-2 7a3 3 0 0 1-3 2H7"/></g>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="13" r="4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  book: '<path d="M4 3h14l2 3v15H4zM8 7h8M8 11h8M8 15h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/>',
  copy: '<path d="M8 8h13v13H8zM3 16V3h13"/>',
  logout: '<path d="M10 3H3v18h7M8 12h13m-4-4 4 4-4 4"/>',
  shield: '<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
  settings:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 5v2"/>',
  ticket: '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4zM15 5v3m0 3v2m0 3v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.discover}</svg>`;
let toastTimer;
function toastHost(t) {
  const d = document.querySelector('dialog[open]');
  (d || document.body).append(t);
  if (typeof t.showPopover === 'function') {
    t.setAttribute('popover', 'manual');
    if (!t.matches(':popover-open')) t.showPopover();
  }
}
export function toast(message, { center = false } = {}) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
  }
  t.textContent = message;
  t.classList.toggle('toast-center', center);
  toastHost(t);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      t.classList.remove('show');
      if (t.matches?.(':popover-open')) t.hidePopover();
    },
    center ? 1800 : 3500,
  );
}
let cleanupModal = null,
  previousFocus,
  restoreScroll = null;
function lockModalScroll() {
  const body = document.body;
  if (!body.style || restoreScroll) return;
  const keys = ['position', 'top', 'left', 'width', 'overflow', 'paddingRight'];
  const before = Object.fromEntries(keys.map((k) => [k, body.style[k]]));
  const x = window.scrollX,
    y = window.scrollY;
  const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  Object.assign(body.style, {
    position: 'fixed',
    top: -y + 'px',
    left: -x + 'px',
    width: '100%',
    overflow: 'hidden',
  });
  if (gap) body.style.paddingRight = gap + 'px';
  document.documentElement.classList.add('modal-open');
  restoreScroll = () => {
    Object.assign(body.style, before);
    document.documentElement.classList.remove('modal-open');
    window.scrollTo(x, y);
  };
}
export function closeModal() {
  const cleanup = cleanupModal;
  cleanupModal = null;
  const d = $('#dialog');
  try {
    if (typeof cleanup === 'function') cleanup();
  } finally {
    const t = d?.querySelector?.('#toast');
    if (t?.id === 'toast') document.body.append(t);
    if (d) {
      d.close();
      d.remove();
    }
    const unlock = restoreScroll;
    restoreScroll = null;
    unlock?.();
    previousFocus?.focus?.({ preventScroll: true });
    if (t?.id === 'toast' && t.classList.contains?.('show')) toastHost(t);
    if (typeof CustomEvent !== 'undefined')
      document.dispatchEvent?.(new CustomEvent('campus:modal-closed'));
  }
}
export function modal(title, html, setup) {
  closeModal();
  previousFocus = document.activeElement;
  const d = document.createElement('dialog');
  d.id = 'dialog';
  d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title" tabindex="-1" autofocus>${esc(title)}</h2><button type="button" class="modal-close" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body">${html}</div>`;
  document.body.append(d);
  d.querySelector('.dialog-head button').onclick = closeModal;
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeModal();
  });
  const outside = (e) => {
    const b = d.getBoundingClientRect();
    return (
      e.target === d &&
      (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
    );
  };
  let backdropPress = false;
  d.addEventListener('pointerdown', (e) => {
    backdropPress = outside(e);
  });
  d.addEventListener('pointercancel', () => {
    backdropPress = false;
  });
  d.addEventListener('click', (e) => {
    const dismiss = backdropPress && outside(e);
    backdropPress = false;
    if (dismiss) closeModal();
  });
  d.setAttribute('aria-labelledby', 'dialog-title');
  try {
    lockModalScroll();
    d.showModal();
    const activeToast = $('#toast');
    if (activeToast?.id === 'toast' && activeToast.classList.contains?.('show'))
      toastHost(activeToast);
    d.querySelector('#dialog-title').focus({ preventScroll: true });
    cleanupModal = setup?.(d) || null;
  } catch (error) {
    closeModal();
    throw error;
  }
  return d;
}
export async function formSubmit(e, work) {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('[type=submit],button:not([type])');
  if (btn) btn.disabled = true;
  const err = e.target.querySelector('.form-error');
  if (err) err.textContent = '';
  try {
    await work(Object.fromEntries(new FormData(e.target)), e.target);
  } catch (x) {
    if (err) err.textContent = x.message;
    else toast(x.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
export function field(label, name, type = 'text', value = '', extra = '') {
  return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
export const errorHTML = '<p class="form-error" role="alert"></p>';
function jpegCanvas(source, width, height, { maxSize = 1600, square = false } = {}) {
  if (!width || !height) throw Error('照片还没有准备好，请稍后再试。');
  const edge = Math.min(width, height),
    scale = Math.min(1, maxSize / (square ? edge : Math.max(width, height))),
    c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((square ? edge : width) * scale));
  c.height = Math.max(1, Math.round((square ? edge : height) * scale));
  const ctx = c.getContext('2d');
  if (!ctx) throw Error('当前浏览器无法处理照片，请换一个浏览器重试。');
  if (square)
    ctx.drawImage(
      source,
      (width - edge) / 2,
      (height - edge) / 2,
      edge,
      edge,
      0,
      0,
      c.width,
      c.height,
    );
  else ctx.drawImage(source, 0, 0, c.width, c.height);
  let data = c.toDataURL('image/jpeg', 0.82);
  if (!square && data.length > 1200000) data = c.toDataURL('image/jpeg', 0.68);
  if (!data.startsWith('data:image/jpeg;base64,'))
    throw Error('照片处理失败，请选择较小的 JPEG 或 PNG 照片。');
  return data;
}
export async function readPhoto(file, options) {
  if (!file || file.size > 20 * 1024 * 1024) throw Error('请选择 20MB 以内的照片');
  let bitmap;
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
        return jpegCanvas(bitmap, bitmap.width, bitmap.height, options);
      } catch {}
    }
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('照片读取失败，请重新选择照片。'));
      reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(Error('这张照片的格式无法读取。请转换为 JPEG / PNG，或用内建摄像头拍摄。'));
      image.src = data;
    });
    return jpegCanvas(img, img.naturalWidth, img.naturalHeight, options);
  } finally {
    bitmap?.close();
  }
}
const uploadAttempts = new Map();
let uploadActive = false;
const uploadQueue = [];
export function uploadPhoto(photo, options = {}) {
  return new Promise((resolve, reject) => {
    const task = () => {
      options.signal?.removeEventListener('abort', cancel);
      if (options.signal?.aborted) {
        reject(new DOMException('上传已取消', 'AbortError'));
        next();
        return;
      }
      uploadActive = true;
      const work = sendPhoto(photo, options);
      work.then(
        (value) => {
          next();
          resolve(value);
        },
        (error) => {
          next();
          reject(error);
        },
      );
    };
    const cancel = () => {
      const index = uploadQueue.indexOf(task);
      if (index >= 0) {
        uploadQueue.splice(index, 1);
        reject(new DOMException('上传已取消', 'AbortError'));
      }
    };
    if (uploadActive) {
      options.onProgress?.({ phase: 'queued' });
      uploadQueue.push(task);
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
    } else task();
  });
}
function next() {
  uploadActive = false;
  uploadQueue.shift()?.();
}
function sendPhoto(photo, { onProgress = () => {}, signal, submissionId } = {}) {
  if (!uploadAttempts.has(photo)) {
    if (uploadAttempts.size >= 8) uploadAttempts.delete(uploadAttempts.keys().next().value);
    uploadAttempts.set(photo, crypto.randomUUID());
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let finished = false;
    const abort = () => xhr.abort();
    const settle = (fn, value) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    xhr.upload.onprogress = (e) =>
      onProgress({ phase: 'upload', loaded: e.loaded, total: e.lengthComputable ? e.total : null });
    xhr.upload.onload = () => onProgress({ phase: 'save' });
    xhr.onload = () => {
      try {
        const result = parseResponse(xhr.responseText, xhr.status);
        if (typeof result?.id !== 'string') throw Error('服务器未确认照片保存，请点击重试。');
        settle(resolve, result);
      } catch (e) {
        settle(reject, e);
      }
    };
    xhr.onerror = () => settle(reject, Error('照片上传中断，请检查网络后点击重试。'));
    xhr.ontimeout = () => settle(reject, Error('照片上传超时，照片已保留，请点击重试。'));
    xhr.onabort = () => {
      const e = Error('上传已取消');
      e.name = 'AbortError';
      settle(reject, e);
    };
    try {
      xhr.open('POST', new URL('/api/media', location.href).href, true);
      xhr.timeout = 90000;
      xhr.setRequestHeader('Content-Type', 'application/json');
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        const e = Error('上传已取消');
        e.name = 'AbortError';
        settle(reject, e);
        return;
      }
      onProgress({ phase: 'upload', loaded: 0, total: null });
      xhr.send(JSON.stringify({ photo, submissionId: submissionId || uploadAttempts.get(photo) }));
    } catch {
      settle(reject, Error('无法开始上传，请刷新页面后重试。'));
    }
  });
}
const photoError = (e) =>
  /expected pattern/i.test(e?.message || '')
    ? '浏览器未能处理这张照片，请重试或选择 JPEG / PNG 照片。'
    : e?.message || '照片处理失败，请重新选择。';
// Draft images stay on this device until the enclosing point/check-in is submitted.
const photoSubmissions = new WeakMap();
const mediaIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function photoUploadStatus(p) {
  return p.phase === 'save'
    ? '照片已发送，正在确认保存…'
    : p.total
      ? '正在上传照片（' + Math.round((p.loaded / p.total) * 100) + '%）'
      : '正在上传照片…';
}
export async function releaseDraftUpload(uploaded) {
  if (!mediaIdPattern.test(uploaded?.id || '')) return;
  try {
    await fetch('/api/media/' + uploaded.id, {
      method: 'DELETE',
      credentials: 'same-origin',
      keepalive: true,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* Server expiry handles closed tabs and disconnected requests. */
  }
}
export async function discardDraftPhoto(draft) {
  let data;
  try {
    data = await draft.read();
  } catch {}
  await draft.clear();
  void releaseDraftUpload(data?.uploaded);
}
export function prepareDraftPhoto(draft, { fallback, onProgress = () => {}, signal } = {}) {
  if (photoSubmissions.has(draft)) return photoSubmissions.get(draft);
  const work = (async () => {
    let data,
      stored = true;
    try {
      await draft.flush();
      data = await draft.read();
    } catch {
      stored = false;
      data = {};
    }
    const photo =
      data.photo ||
      fallback?.preview ||
      (fallback?.url?.startsWith('data:image/jpeg;base64,') ? fallback.url : null);
    let uploaded = data.uploaded || (fallback?.id ? fallback : null);
    if (uploaded?.id && mediaIdPattern.test(uploaded.id)) {
      try {
        uploaded = await api('/api/media/' + uploaded.id);
      } catch (e) {
        if (![404, 410].includes(e.status)) throw e;
        uploaded = null;
      }
    } else uploaded = null;
    if (!uploaded) {
      if (!photo?.startsWith('data:image/jpeg;base64,')) {
        if (!photo && !data.uploaded && !fallback) return null;
        throw Error('照片临时存储已过期，请重新选择照片');
      }
      const signature = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(photo))),
      ]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const attempt =
        data.uploadAttempt?.signature === signature
          ? data.uploadAttempt
          : { id: uploadAttempts.get(photo) || crypto.randomUUID(), signature };
      if (stored) {
        try {
          await draft.update({ uploadAttempt: attempt });
        } catch {
          stored = false;
        }
      }
      uploaded = await uploadPhoto(photo, { onProgress, signal, submissionId: attempt.id });
    }
    if (stored) {
      const current = await draft.read();
      if (current.photo !== data.photo) {
        void releaseDraftUpload(uploaded);
        throw Error('照片已更换或草稿已丢弃，请重新提交');
      }
      await draft.update({ uploaded }).catch(() => {});
    }
    return { ...uploaded, preview: photo || uploaded.url };
  })();
  photoSubmissions.set(draft, work);
  work
    .finally(() => {
      if (photoSubmissions.get(draft) === work) photoSubmissions.delete(draft);
    })
    .catch(() => {});
  return work;
}
export function photoPicker(
  onSaved,
  {
    draft,
    notice,
    keepDraft = false,
    confirmedMediaId = null,
    keepDraftLabel = '照片已选好，正式提交时上传',
  } = {},
) {
  return modal(
    '留住这一刻',
    `<p class="muted">手机优先使用系统相机；无法使用时可开启网页取景。相册入口只在你主动选择时打开。</p>${keepDraft ? '<p class="tip">照片先存本机，正式提交时才上传。未绑定的临时副本会在 24 小时后自动回收。</p>' : ''}<input type="file" id="native-camera" accept="image/*" capture="environment" hidden><video id="photo-live" class="photo-live" autoplay muted playsinline hidden></video><img id="photo-preview" class="photo-preview" alt="待上传照片" hidden><div class="button-row"><button id="open-camera" class="button">${icon('camera')} 打开摄像头</button><button id="web-camera" type="button" class="button secondary">网页相机</button><label class="button secondary file-button">选择照片<input type="file" id="photo-file" accept="image/*" aria-label="从相册选择照片"></label></div><section id="photo-progress" class="photo-progress" hidden><div class="upload-caption"><span id="upload-stage" role="status">准备照片</span><b id="upload-percent"></b></div><div id="upload-meter" class="upload-meter indeterminate" role="progressbar" aria-label="照片上传进度" aria-valuemin="0" aria-valuemax="100"><span></span></div><small id="upload-hint">请保持页面打开</small></section><p class="form-error" id="camera-error" role="alert"></p><button id="retry-photo" class="button secondary wide" hidden>重试保存这张照片</button>`,
    (d) => {
      let pendingPhoto,
        uploaded,
        busy = false,
        controller;
      const native = $('#native-camera', d),
        preview = $('#photo-preview', d),
        open = $('#open-camera', d),
        file = $('#photo-file', d),
        retry = $('#retry-photo', d);
      let locallySaved = false;
      if (notice) {
        notice.box.classList.add('photo-draft-status');
        $('.dialog-body', d).prepend(notice.box);
      }
      const retain = async (patch) => {
        if (!draft) return false;
        try {
          draft.reopen();
          await draft.update(patch);
          locallySaved = true;
          return true;
        } catch {
          locallySaved = false;
          return false;
        }
      };
      let stream = null,
        starting = false,
        cameraGeneration = 0,
        preferWeb = false;
      const video = $('#photo-live', d),
        web = $('#web-camera', d);
      const mobile =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
        navigator.userAgentData?.mobile;
      web.hidden = !mobile;
      const stop = () => {
        cameraGeneration++;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        starting = false;
        video.srcObject = null;
        video.hidden = true;
        open.innerHTML = icon('camera') + ' 打开摄像头';
      };
      const startWeb = async () => {
        if (starting || stream || busy) return;
        starting = true;
        open.disabled = true;
        const generation = ++cameraGeneration;
        try {
          if (!navigator.mediaDevices?.getUserMedia)
            throw Error('当前浏览器无法开启网页相机，请使用HTTPS或本机预览。');
          const next = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          if (!d.isConnected || generation !== cameraGeneration || document.hidden) {
            next.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = next;
          video.srcObject = stream;
          video.hidden = false;
          preview.hidden = true;
          await video.play();
          if (d.isConnected && stream) {
            open.innerHTML = icon('camera') + ' 拍一张';
            $('#camera-error', d).textContent = '';
          }
        } catch (e) {
          stop();
          if (d.isConnected)
            $('#camera-error', d).textContent =
              e.name === 'NotAllowedError'
                ? '未获得相机权限。可以允许权限后重试，或主动选择相册。'
                : photoError(e);
        } finally {
          starting = false;
          if (d.isConnected) open.disabled = false;
        }
      };
      const visibility = () => {
        if (document.hidden) stop();
      };
      document.addEventListener('visibilitychange', visibility);
      web.onclick = () => {
        preferWeb = true;
        void startWeb();
      };
      const lock = (value) => {
        busy = value;
        open.disabled = value;
        file.disabled = value;
        file.closest('label').classList.toggle('disabled', value);
        native.disabled = value;
        retry.disabled = value;
      };
      const progress = (p) => {
        if (!d.isConnected) return;
        $('#photo-progress', d).hidden = false;
        const meter = $('#upload-meter', d);
        const determinate = p.phase === 'upload' && p.total;
        meter.classList.toggle('indeterminate', !determinate);
        if (determinate) {
          const percent = Math.min(100, Math.round((p.loaded / p.total) * 100));
          meter.setAttribute('aria-valuenow', percent);
          meter.firstElementChild.style.width = percent + '%';
          $('#upload-percent', d).textContent = percent + '%';
        } else {
          meter.removeAttribute('aria-valuenow');
          meter.firstElementChild.style.width = '';
          $('#upload-percent', d).textContent = '';
        }
        $('#upload-stage', d).textContent =
          p.phase === 'queued'
            ? '已加入上传队列'
            : p.phase === 'prepare'
              ? '正在读取、压缩照片'
              : p.phase === 'upload'
                ? '正在上传照片'
                : '照片已发送，正在保存';
        $('#upload-hint', d).textContent =
          p.phase === 'upload' && p.total
            ? `${(p.loaded / 1024).toFixed(0)} / ${(p.total / 1024).toFixed(0)} KB · 关闭弹窗会取消上传`
            : '请保持页面打开，完成后会自动提示';
      };
      const finish = async () => {
        if (busy || !pendingPhoto || !d.isConnected) return;
        lock(true);
        retry.hidden = true;
        $('#camera-error', d).textContent = '';
        controller = new AbortController();
        try {
          if (keepDraft) {
            await onSaved({
              id: null,
              url: pendingPhoto,
              preview: pendingPhoto,
              local: true,
              locallySaved,
            });
            if (d.isConnected) {
              closeModal();
              toast(keepDraftLabel);
            }
            return;
          }
          if (uploaded) {
            try {
              uploaded = await api('/api/media/' + uploaded.id);
            } catch (e) {
              if (![404, 410].includes(e.status)) throw e;
              uploaded = null;
            }
          }
          if (!uploaded) {
            uploaded = await uploadPhoto(pendingPhoto, {
              signal: controller.signal,
              onProgress: progress,
            });
            await retain({ photo: pendingPhoto, uploaded });
          }
          if (!d.isConnected) return;
          progress({ phase: 'save' });
          await onSaved(uploaded);
          if (draft && !keepDraft) {
            try {
              await draft.clear({ submitted: true });
            } catch {
              toast('照片已提交，但本机草稿清理失败；请稍后丢弃。');
            }
          }
          if (d.isConnected) {
            closeModal();
            toast(keepDraft ? keepDraftLabel : '照片已提交到账号');
          }
        } catch (e) {
          if (d.isConnected && e.name !== 'AbortError') {
            const msg = e.message || '照片保存失败，请重试。';
            $('#camera-error', d).textContent = /expected pattern/i.test(msg)
              ? '照片处理或服务连接异常。请重试；仍失败时选择 JPEG / PNG 照片。'
              : msg;
            retry.hidden = false;
            $('#upload-stage', d).textContent = locallySaved
              ? '提交失败，照片草稿已保存到本机'
              : '提交失败，照片暂留当前页面';
            $('#upload-hint', d).textContent = '无需重新选图，点击下方重试；也可以重新选择照片。';
            $('#upload-meter', d).classList.remove('indeterminate');
          }
        } finally {
          if (d.isConnected) lock(false);
        }
      };
      const selected = async (photo) => {
        void releaseDraftUpload(uploaded);
        pendingPhoto = photo;
        uploaded = null;
        stop();
        preview.src = photo;
        preview.hidden = false;
        await retain({ photo, uploaded: null });
        if (!d.isConnected) return;
        lock(false);
        await finish();
      };
      file.onchange = async (e) => {
        const chosen = e.target.files?.[0];
        if (!chosen || busy) return;
        lock(true);
        retry.hidden = true;
        $('#camera-error', d).textContent = '';
        progress({ phase: 'prepare' });
        try {
          const data = await readPhoto(chosen);
          if (d.isConnected) await selected(data);
        } catch (e) {
          if (d.isConnected) {
            $('#camera-error', d).textContent = photoError(e);
            $('#photo-progress', d).hidden = true;
          }
        } finally {
          file.value = '';
          if (d.isConnected) lock(false);
        }
      };
      native.onchange = file.onchange;
      native.addEventListener('cancel', () => {
        preferWeb = true;
        if (d.isConnected) {
          open.innerHTML = icon('camera') + ' 开启网页相机';
          $('#camera-error', d).textContent =
            '没有拍摄照片。再次点击可使用网页取景，不会自动打开相册。';
        }
      });
      open.onclick = async () => {
        if (busy || starting) return;
        if (stream) {
          try {
            await selected(jpegCanvas(video, video.videoWidth, video.videoHeight));
          } catch (e) {
            $('#camera-error', d).textContent = photoError(e);
          }
          return;
        }
        if (mobile && 'capture' in native && !preferWeb) {
          native.value = '';
          native.click();
        } else await startWeb();
      };
      retry.onclick = finish;
      if (draft) {
        lock(true);
        draft
          .read()
          .then(async (data) => {
            if (!d.isConnected) return;
            if (data.uploaded?.id === confirmedMediaId) {
              await draft.clear({ submitted: true });
              return;
            }
            if (
              typeof data.photo === 'string' &&
              data.photo.startsWith('data:image/jpeg;base64,')
            ) {
              pendingPhoto = data.photo;
              uploaded = data.uploaded?.id ? data.uploaded : null;
              locallySaved = true;
              preview.src = pendingPhoto;
              preview.hidden = false;
              retry.hidden = false;
              retry.textContent = keepDraft ? '使用恢复的照片' : '提交恢复的照片';
            }
          })
          .catch(() => {})
          .finally(() => {
            if (d.isConnected) lock(false);
          });
      }
      if (notice)
        notice.discard.onclick = async () => {
          if (busy) return;
          lock(true);
          try {
            await discardDraftPhoto(draft);
            if (keepDraft) await onSaved(null);
            pendingPhoto = null;
            uploaded = null;
            locallySaved = false;
            preview.hidden = true;
            preview.removeAttribute('src');
            retry.hidden = true;
            $('#photo-progress', d).hidden = true;
            $('#camera-error', d).textContent = '';
            stop();
          } catch {
          } finally {
            if (d.isConnected) lock(false);
          }
        };
      return () => {
        controller?.abort();
        stop();
        document.removeEventListener('visibilitychange', visibility);
        notice?.unsubscribe();
      };
    },
  );
}
export function passwordDialog() {
  modal(
    '修改密码',
    `<form id="pw-form">${field('当前密码', 'currentPassword', 'password', '', 'required autocomplete="current-password"')}${field('新密码（至少 8 位）', 'newPassword', 'password', '', 'required minlength="8" maxlength="128" autocomplete="new-password"')}${field('再次输入新密码', 'confirm', 'password', '', 'required autocomplete="new-password"')}${errorHTML}<button type="submit" class="button wide">保存新密码</button></form>`,
    (d) => {
      $('#pw-form', d).onsubmit = (e) =>
        formSubmit(e, async (f) => {
          if (f.newPassword !== f.confirm) throw Error('两次新密码不一致');
          await api('/api/auth/password', 'PATCH', f);
          closeModal();
          toast('密码已修改，其他登录已失效');
        });
    },
  );
}

// The same authorized URL serves a bounded thumbnail; detail links keep the full photo.
export function thumbnail(url) {
  const value = String(url || '');
  return value.startsWith('/') && !value.startsWith('//')
    ? value + (value.includes('?') ? '&' : '?') + 'size=thumb'
    : value;
}
