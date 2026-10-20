import { $, api, esc, readPhoto, uploadPhoto } from './ui.js';
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
  return `${includeBody ? `<p class="message-copy">${esc(value.body ?? value.message ?? '')}</p>` : ''}${image ? `<a href="${esc(image)}" target="_blank" rel="noopener" aria-label="查看配图原图"><img class="message-image" src="${esc(image)}" alt="消息配图" loading="lazy"></a>` : ''}<div class="message-links">${(
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
  return `<details class="message-attachments"><summary>添加配图或链接（选填）</summary><label>配图<input class="rich-file" type="file" accept="image/*"></label><input type="hidden" name="imageId" value="${esc(value.imageId || '')}"><small class="rich-status" role="status"></small><button type="button" class="text-btn rich-retry" hidden>重试配图上传</button><button type="button" class="text-btn rich-remove">移除配图</button><label>链接 · 每行“名称 | 地址”，最多5条<textarea name="richLinks" rows="3" maxlength="5500" placeholder="去发布发现 | #publish&#10;活动专题 | #topics">${esc((value.links || []).map((l) => l.label + ' | ' + l.href).join('\n'))}</textarea></label><p class="muted">站内窗口直接打开；HTTPS外链会明确标示并在新页打开。</p></details>`;
}
export function bindRich(root) {
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
    return { imageId: id.value, links };
  };
}
