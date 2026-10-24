import { floatingPanel } from '/shared/floating-panel.js';
import {
  $,
  esc,
  icon,
  prepareDraftPhoto,
  discardDraftPhoto,
  photoUploadStatus,
  toast,
  modal,
  closeModal,
} from '/shared/ui.js';
export async function publishGallery({
  host,
  button,
  accountDraft,
  draftPhoto,
  alive,
  initialPhoto = null,
  onChange = () => {},
}) {
  const manifest = accountDraft('publish-gallery');
  let entries = [],
    coverId = '',
    locked = false,
    choosing = false;
  const context = (id) => (id === 'primary' ? 'publish-photo' : 'publish-extra-photo:' + id);
  const ordered = () =>
    [...entries].sort((a, b) => Number(b.id === coverId) - Number(a.id === coverId));
  const persist = async () => {
    manifest.reopen();
    await manifest.update({ ids: entries.map((e) => e.id), coverId });
  };
  const valid = () => alive() && !locked;
  const changed = () => {
    onChange(ordered()[0]?.photo || null);
    draw();
  };
  const remove = async (entry) => {
    if (!valid()) return;
    locked = true;
    draw();
    try {
      await discardDraftPhoto(accountDraft(context(entry.id)));
      entries = entries.filter((e) => e !== entry);
      if (coverId === entry.id) coverId = entries[0]?.id || '';
      await persist();
    } catch (e) {
      toast(e.message);
    } finally {
      locked = false;
      changed();
    }
  };
  function confirmRemove(button, entry) {
    if (!valid()) return;
    floatingPanel({
      title: '移除这张照片？',
      body: '<p class="floating-description">照片会从本次发布中移除。</p><button type="button" class="button danger floating-delete" data-confirm-remove>删除</button>',
      anchor: button,
      className: 'photo-delete-popover',
      mount(panel, close) {
        $('[data-confirm-remove]', panel).onclick = () => {
          close(true);
          void remove(entry);
        };
      },
    });
  }
  function preview(entry) {
    if (!valid()) return;
    modal(
      '查看照片',
      `<div class="gallery-cover-view"><img src="${esc(entry.photo.preview || entry.photo.url)}" alt="待发布照片"><p>${entry.id === coverId ? '这张照片是当前封面' : '发布后，封面会显示在发现卡片上'}</p><button type="button" class="button wide" id="gallery-set-cover" ${entry.id === coverId ? 'disabled' : ''}>设置该照片为封面</button></div>`,
      (d) => {
        $('#gallery-set-cover', d).onclick = async (event) => {
          if (!valid()) return;
          event.currentTarget.disabled = true;
          const previous = coverId;
          coverId = entry.id;
          try {
            await persist();
            changed();
            closeModal();
            toast('已设置为封面');
          } catch (e) {
            coverId = previous;
            event.currentTarget.disabled = false;
            toast(e.message);
          }
        };
      },
    );
  }
  function draw() {
    if (!alive()) return;
    host.innerHTML = entries
      .map(
        (e, i) =>
          `<figure><button type="button" data-no-liquid class="gallery-preview" data-gallery-preview="${e.id}" aria-label="查看照片${i + 1}，可设置封面" ${locked ? 'disabled' : ''}><img src="${esc(e.photo.preview || e.photo.url)}" alt="照片${i + 1}"></button><button type="button" data-no-liquid class="gallery-remove" data-gallery-remove="${e.id}" aria-label="移除照片${i + 1}" ${locked ? 'disabled' : ''}>${icon('close')}</button><figcaption>${e.id === coverId ? '封面' : '照片 ' + (i + 1)}</figcaption><small role="status">${esc(e.status || '')}</small></figure>`,
      )
      .join('');
    button.className = 'gallery-add';
    button.disabled = locked || choosing || entries.length >= 9;
    button.hidden = entries.length >= 9;
    button.innerHTML = `${icon('plus')}<span>${entries.length ? entries.length + ' / 9' : '添加照片'}</span>`;
    host.append(button);
    host
      .querySelectorAll('[data-gallery-preview]')
      .forEach(
        (b) => (b.onclick = () => preview(entries.find((e) => e.id === b.dataset.galleryPreview))),
      );
    host.querySelectorAll('[data-gallery-remove]').forEach(
      (b) =>
        (b.onclick = () =>
          confirmRemove(
            b,
            entries.find((e) => e.id === b.dataset.galleryRemove),
          )),
    );
  }
  try {
    const saved = await manifest.read();
    if (initialPhoto) entries.push({ id: 'primary', photo: initialPhoto });
    for (const id of (saved.ids || []).slice(0, 9)) {
      if (id === 'primary' || !/^[a-f0-9-]{36}$/.test(id)) continue;
      const d = await accountDraft(context(id)).read();
      if (d.photo && entries.length < 9)
        entries.push({
          id,
          photo: { ...(d.uploaded || {}), preview: d.photo, url: d.photo, local: !d.uploaded?.id },
        });
    }
    coverId = entries.some((e) => e.id === saved.coverId) ? saved.coverId : entries[0]?.id || '';
  } catch {
    toast('部分照片草稿未能恢复，请核对后发布');
  }
  button.onclick = async () => {
    if (!valid() || choosing || entries.length >= 9) return;
    choosing = true;
    draw();
    const id = crypto.randomUUID();
    try {
      await draftPhoto(
        async (photo) => {
          if (!alive() || locked) throw Error('页面或账号已改变，请回到发布页重试');
          if (!photo) return;
          if (entries.length >= 9) throw Error('最多选择9张照片');
          entries.push({ id, photo });
          coverId ||= id;
          try {
            await persist();
          } catch {
            toast('照片暂留当前页面，请及时发布或存草稿');
          }
          changed();
        },
        context(id),
        { keepDraft: true },
      );
    } finally {
      choosing = false;
      draw();
    }
  };
  changed();
  return {
    refresh: draw,
    get count() {
      return entries.length;
    },
    setBusy(value) {
      locked = value;
      draw();
    },
    async upload() {
      const ids = [];
      for (const entry of ordered()) {
        if (!alive()) throw Error('页面或账号已改变，草稿已保留');
        const photo = await prepareDraftPhoto(accountDraft(context(entry.id)), {
          fallback: entry.photo,
          onProgress: (p) => {
            entry.status = photoUploadStatus(p);
            draw();
          },
        });
        if (!photo) throw Error('照片未能恢复，请重新选择');
        entry.photo = photo;
        entry.status = '临时上传就绪';
        ids.push(photo.id);
        draw();
      }
      return ids;
    },
    async flush() {
      await manifest.flush();
      await Promise.all(entries.map((e) => accountDraft(context(e.id)).flush()));
    },
    async clear(submitted = true) {
      for (const e of entries) {
        const d = accountDraft(context(e.id));
        if (submitted) await d.clear({ submitted: true });
        else await discardDraftPhoto(d);
      }
      await manifest.clear({ submitted });
      entries = [];
      coverId = '';
      changed();
    },
    previewHTML() {
      return ordered()
        .map(
          (e, i) =>
            `<img src="${esc(e.photo.preview || e.photo.url)}" alt="${i ? '补充照片' : '封面照片'}">`,
        )
        .join('');
    },
  };
}
