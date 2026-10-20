import {
  $,
  esc,
  icon,
  prepareDraftPhoto,
  discardDraftPhoto,
  photoUploadStatus,
  toast,
} from '/shared/ui.js';
export async function publishGallery({
  host,
  button,
  accountDraft,
  draftPhoto,
  alive,
  hasCover = () => false,
}) {
  const manifest = accountDraft('publish-gallery');
  let entries = [],
    locked = false;
  const context = (id) => 'publish-extra-photo:' + id;
  const persist = async () => {
    manifest.reopen();
    await manifest.update({ ids: entries.map((e) => e.id) });
  };
  const draw = () => {
    if (!alive()) return;
    host.innerHTML = entries
      .map(
        (e, i) =>
          `<figure><img src="${esc(e.photo.preview || e.photo.url)}" alt="补充照片${i + 1}"><figcaption>照片 ${i + 2}</figcaption><button data-no-liquid type="button" data-gallery-remove="${e.id}" aria-label="移除补充照片${i + 1}" ${locked ? 'disabled' : ''}>${icon('close')}</button><small role="status">${esc(e.status || '本机草稿')}</small></figure>`,
      )
      .join('');
    button.disabled = locked || entries.length >= 8;
    button.textContent =
      entries.length >= 8
        ? '已选9张（含封面）'
        : `继续添加照片 · ${entries.length + (hasCover() ? 1 : 0)} / 9`;
    host.querySelectorAll('[data-gallery-remove]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (locked) return;
          const entry = entries.find((e) => e.id === b.dataset.galleryRemove);
          b.disabled = true;
          try {
            await discardDraftPhoto(accountDraft(context(entry.id)));
            entries = entries.filter((e) => e !== entry);
            await persist();
            draw();
          } catch (e) {
            b.disabled = false;
            toast(e.message);
          }
        }),
    );
  };
  try {
    const saved = await manifest.read();
    for (const id of (saved.ids || []).slice(0, 8)) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      const d = await accountDraft(context(id)).read();
      if (d.photo)
        entries.push({
          id,
          photo: { ...(d.uploaded || {}), preview: d.photo, url: d.photo, local: !d.uploaded?.id },
          status: '已恢复本机照片',
        });
    }
  } catch {
    toast('部分补充照片未能恢复，请核对后再发布');
  }
  draw();
  button.onclick = () => {
    if (locked || entries.length >= 8) return;
    const id = crypto.randomUUID();
    draftPhoto(
      async (photo) => {
        if (!alive() || locked) throw Error('请回到当前账号的发布页后重试');
        if (!photo) return;
        entries.push({
          id,
          photo,
          status: photo.locallySaved === false ? '当前页面暂存，请及时提交' : '本机草稿',
        });
        try {
          await persist();
        } catch {
          toast('照片暂留本页，本机草稿目录保存失败');
        }
        draw();
      },
      context(id),
      { keepDraft: true },
    );
  };
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
      for (const entry of entries) {
        if (!alive()) throw Error('页面或账号已改变，照片草稿已保留');
        const photo = await prepareDraftPhoto(accountDraft(context(entry.id)), {
          fallback: entry.photo,
          onProgress: (p) => {
            entry.status = photoUploadStatus(p);
            draw();
          },
        });
        if (!photo) throw Error('补充照片未能恢复，请重新选择');
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
      for (const entry of entries) {
        const d = accountDraft(context(entry.id));
        if (submitted) await d.clear({ submitted: true });
        else await discardDraftPhoto(d);
      }
      await manifest.clear({ submitted });
      entries = [];
      draw();
    },
    previewHTML() {
      return entries
        .map((e, i) => `<img src="${esc(e.photo.preview || e.photo.url)}" alt="补充照片${i + 1}">`)
        .join('');
    },
  };
}
