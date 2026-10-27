import { $, api, esc, readPhoto, uploadPhoto, icon } from './ui.js';
import { getPreferenceAccountId } from './preferences.js';
export function safeTarget(value) {
  const s = String(value || '');
  if (
    /^#(?:discover|shots|topics|map|navigate|routes|me|settings|passport|publish|notifications|my-works|contact|support|plans|collections|guides|updates|(?:place|spot|topic|conversation|notice|shared-plan|guide)\/[a-z0-9-]+)$/.test(
      s,
    )
  )
    return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' && !u.username && !u.password) return u.href;
  } catch {}
  return '';
}
export function richHTML(value, { includeBody = true } = {}) {
  let image = /^(?:\/admin)?\/api\/messages\/media\/[a-f0-9-]{36}$/.test(value.image || '')
    ? value.image.replace(/^\/admin/, '')
    : '';
  if (image && location.pathname.startsWith('/admin/')) image = '/admin' + image;
  const files = (value.files || [])
    .filter((f) => /^\/api\/messages\/files\/[a-f0-9-]{36}$/.test(f.url || ''))
    .map(
      (f) =>
        '<a class="message-file812" download href="' +
        (location.pathname.startsWith('/admin/') ? '/admin' : '') +
        esc(f.url) +
        '">' +
        icon('file') +
        '<span><strong translate="no">' +
        esc(f.name) +
        '</strong><small>' +
        esc(formatFileSize(f.size)) +
        ' · 下载文件</small></span></a>',
    )
    .join('');
  return `${includeBody ? `<p class="message-copy">${esc(value.body ?? value.message ?? '')}</p>` : ''}${image ? `<a href="${esc(image)}" target="_blank" rel="noopener" aria-label="查看配图原图"><img class="message-image" src="${esc(image)}" alt="消息配图" loading="lazy"></a>` : ''}${files}<div class="message-links">${(
    value.links || []
  )
    .map((l) => {
      let href = safeTarget(l.href);
      const userWindow = href.startsWith('#') && document.body.dataset.audience === 'admin';
      if (userWindow) {
        const user = new URL(location.href);
        user.pathname = '/';
        user.search = '';
        user.hash = href;
        if (
          !location.pathname.startsWith('/admin/') &&
          ['4176', '4346', '4356', '4366'].includes(user.port)
        )
          user.port = String(Number(user.port) - 2);
        href = user.href;
      }
      return href
        ? `<a class="button secondary" href="${esc(href)}" ${userWindow || href.startsWith('https:') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${esc(l.label)} ↗</a>`
        : '';
    })
    .join('')}</div>`;
}
export function richFields(value = {}) {
  const attachments =
    value.conversationId || value.userId
      ? `<section class="private-files812" data-thread="${esc(value.conversationId || '')}" data-user="${esc(value.userId || '')}"><label>文件 · 每条最多3个，单个不超过10MB<input class="private-file-input812" type="file" multiple></label><div class="private-file-list812" role="status"></div></section>`
      : '';
  return `<details class="message-attachments"><summary>添加配图${attachments ? '、文件' : ''}或链接（选填）</summary><label>配图<input class="rich-file" type="file" accept="image/*"></label><input type="hidden" name="imageId" value="${esc(value.imageId || '')}"><small class="rich-status" role="status"></small><button type="button" class="text-btn rich-retry" hidden>重试配图上传</button><button type="button" class="text-btn rich-remove">移除配图</button>${attachments}<label>链接 · 每行“名称 | 地址”，最多5条<textarea name="richLinks" rows="3" maxlength="5500" placeholder="去发布发现 | #publish&#10;活动专题 | #topics">${esc((value.links || []).map((l) => l.label + ' | ' + l.href).join('\n'))}</textarea></label><p class="muted">站内窗口直接打开；HTTPS外链会明确标示并在新页打开。</p></details>`;
}
export function formatFileSize(value) {
  const n = Number(value) || 0;
  return n >= 1024 * 1024
    ? (n / 1024 / 1024).toFixed(1) + ' MB'
    : Math.max(1, Math.ceil(n / 1024)) + ' KB';
}
function bindMessageFiles(root) {
  const owner = getPreferenceAccountId();
  const box = $('.private-files812', root);
  if (!box) return () => [];
  const input = $('.private-file-input812', box),
    list = $('.private-file-list812', box),
    rows = [];
  let hint = '',
    uploads = Promise.resolve();
  const enqueue = (row) => {
    uploads = uploads.then(() => upload(row));
  };
  const render = () => {
    if (!root.isConnected) return;
    list.innerHTML =
      rows
        .map(
          (r, i) =>
            '<div class="private-file-row812"><span><strong translate="no">' +
            esc(r.file.name) +
            '</strong><small>' +
            formatFileSize(r.file.size) +
            ' · ' +
            esc(r.error || (r.saved ? '已上传' : '上传中…')) +
            '</small></span>' +
            (r.error
              ? '<button type="button" class="text-btn" data-retry-file="' + i + '">重试</button>'
              : '') +
            '<button type="button" class="text-btn" aria-label="移除文件" data-remove-file="' +
            i +
            '">移除</button></div>',
        )
        .join('') + (hint ? '<p class="form-error">' + esc(hint) + '</p>' : '');
    list.querySelectorAll('[data-remove-file]').forEach(
      (b) =>
        (b.onclick = () => {
          rows.splice(Number(b.dataset.removeFile), 1);
          hint = '';
          render();
        }),
    );
    list.querySelectorAll('[data-retry-file]').forEach(
      (b) =>
        (b.onclick = () => {
          const row = rows[Number(b.dataset.retryFile)];
          if (row && !row.uploading) {
            row.uploading = true;
            row.error = '';
            enqueue(row);
            render();
          }
        }),
    );
  };
  async function upload(row) {
    if (!root.isConnected || !rows.includes(row)) return;
    row.error = '';
    row.uploading = true;
    render();
    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(Error('文件读取失败，请重试'));
        reader.readAsDataURL(row.file);
      });
      if (!root.isConnected || !rows.includes(row)) return;
      if (getPreferenceAccountId() !== owner) throw Error('账号已变化，请重新选择文件');
      row.saved = await api(
        document.body.dataset.audience === 'admin'
          ? '/api/admin/messages/files'
          : '/api/messages/files',
        'POST',
        {
          name: row.file.name,
          content,
          conversationId: box.dataset.thread,
          userId: box.dataset.user,
          submissionId: row.submission,
        },
      );
    } catch (e) {
      row.error = e.message;
    } finally {
      row.uploading = false;
      render();
    }
  }
  input.onchange = () => {
    hint = '';
    for (const file of input.files || []) {
      if (rows.length >= 3) {
        hint = '每条消息最多3个文件';
        break;
      }
      if (!file.size || file.size > 10 * 1024 * 1024) {
        hint = '请选择非空且不超过10MB的文件';
        continue;
      }
      const row = { file, submission: crypto.randomUUID(), uploading: true, error: '' };
      rows.push(row);
      enqueue(row);
    }
    input.value = '';
    render();
  };
  return () => {
    if (getPreferenceAccountId() !== owner) throw Error('账号已变化，请重新打开对话');
    if (rows.some((r) => r.uploading || r.error || !r.saved))
      throw Error('文件尚未上传成功，可重试失败文件或移除后发送');
    return rows.map((r) => r.saved.id);
  };
}
export function bindRich(root) {
  const files = bindMessageFiles(root);
  const file = $('.rich-file', root),
    status = $('.rich-status', root),
    id = $('[name=imageId]', root),
    retry = $('.rich-retry', root);
  let generation = 0;
  let pending,
    uploading = false,
    failed = false,
    submissionId;
  const upload = async () => {
    if (!pending) return;
    const serial = ++generation;
    const selected = pending;
    uploading = true;
    failed = false;
    status.textContent = '正在压缩和上传配图…';
    retry.hidden = true;
    try {
      const data = await readPhoto(selected);
      const saved = await uploadPhoto(data, { submissionId });
      if (root.isConnected && serial === generation) {
        id.value = saved.id;
        status.textContent = '配图已准备好';
      }
    } catch (e) {
      if (root.isConnected && serial === generation) {
        failed = true;
        status.textContent = e.message;
        retry.hidden = false;
      }
    } finally {
      if (serial === generation) uploading = false;
    }
  };
  file.onchange = () => {
    pending = file.files?.[0];
    submissionId = crypto.randomUUID();
    id.value = '';
    void upload();
  };
  retry.onclick = upload;
  $('.rich-remove', root).onclick = () => {
    generation++;
    uploading = false;
    pending = null;
    id.value = '';
    file.value = '';
    failed = false;
    status.textContent = '已移除配图';
  };
  return () => {
    if (uploading || failed) throw Error('请等待配图上传成功，或移除后再发送');
    const lines = $('[name=richLinks]', root)
      .value.split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    if (lines.length > 5) throw Error('最多添加5个链接');
    const links = lines.map((line) => {
      const at = line.indexOf('|');
      const label = line.slice(0, at).trim(),
        href = safeTarget(line.slice(at + 1).trim());
      if (at < 1 || !href) throw Error('链接格式为“名称 | 站内窗口或HTTPS地址”');
      return { label, href };
    });
    const fileIds = files();
    return { imageId: id.value, links, ...(fileIds.length ? { fileIds } : {}) };
  };
}
