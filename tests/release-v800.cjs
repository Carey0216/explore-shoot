const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function load(file, bindings = {}) {
  const code = fs.readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  global.__v732 = bindings;
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(`const {${Object.keys(bindings)}}=globalThis.__v732;\n` + code).toString('base64')
  );
}
(async () => {
  const { replyDelay, replyChunks } = await load('dist/shared/chat-feedback.js');
  assert.equal(replyDelay(100, 100), 1250);
  assert.equal(replyDelay(100, 2000), 0);
  for (const text of ['校园📸👩‍🎓，你好。', '很长的一段说明'.repeat(700), '']) {
    const chunks = replyChunks(text);
    assert.equal(chunks.map((c) => c.text).join(''), text);
    assert(chunks.length <= 160);
    assert(chunks.every((c) => c.delay <= 1800));
  }
  let savedManifest, currentModal;
  const photoIds = Array.from(
    { length: 8 },
    (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
  );
  const drafts = new Map([
    ['publish-gallery', { ids: photoIds, coverId: photoIds[4] }],
    ['publish-photo', { photo: 'primary' }],
    ...photoIds.map((id) => ['publish-extra-photo:' + id, { photo: id }]),
  ]);
  const host = {
    nodes: [],
    set innerHTML(html) {
      this.html = html;
      this.nodes = [];
      for (const m of html.matchAll(/data-gallery-(preview|remove)="([^"]+)"/g))
        this.nodes.push({
          dataset: { [m[1] === 'preview' ? 'galleryPreview' : 'galleryRemove']: m[2] },
        });
    },
    querySelectorAll(selector) {
      return selector.includes('data-gallery-preview')
        ? this.nodes.filter((n) => n.dataset.galleryPreview)
        : selector.includes('data-gallery-remove')
          ? this.nodes.filter((n) => n.dataset.galleryRemove)
          : [];
    },
    append() {},
  };
  const button = {};
  const { publishGallery } = await load('dist/user/publish-gallery.js', {
    $: (selector, root) => root.querySelector(selector),
    esc: (v) => String(v),
    icon: () => '',
    prepareDraftPhoto: async (d, { fallback }) => ({ ...fallback, id: fallback.url }),
    discardDraftPhoto: async () => {},
    photoUploadStatus: () => '',
    toast() {},
    closeModal() {},
    modal: (_title, html, setup) => {
      const action = { disabled: false };
      currentModal = { html, action };
      setup({ querySelector: () => action });
    },
  });
  const gallery = await publishGallery({
    host,
    button,
    initialPhoto: { url: 'primary', preview: 'primary' },
    alive: () => true,
    draftPhoto() {
      throw Error('Nine photos must prevent another picker');
    },
    accountDraft: (context) => ({
      read: async () => drafts.get(context) || {},
      reopen() {},
      update: async (v) => {
        savedManifest = v;
      },
      flush: async () => {},
      clear: async () => {},
    }),
  });
  assert.equal(gallery.count, 9);
  assert.equal(button.hidden, true);
  assert.equal((await gallery.upload())[0], photoIds[4]);
  host
    .querySelectorAll('[data-gallery-preview]')
    .find((n) => n.dataset.galleryPreview === photoIds[2])
    .onclick();
  await currentModal.action.onclick({ currentTarget: currentModal.action });
  assert.equal(savedManifest.coverId, photoIds[2]);
  assert.equal((await gallery.upload())[0], photoIds[2]);
  await button.onclick();
  assert.equal(gallery.count, 9);
  const store = new Map();
  let opts;
  const session = { account: { id: 'fixture' }, origin: 'https://fixture.invalid' };
  const files = new Set(['one', 'two', 'three']),
    removed = [];
  const wx = {
    env: { USER_DATA_PATH: '/sandbox' },
    getStorageSync: (k) => (k === 'explore-mini-session-v1' ? session : store.get(k)),
    setStorageSync: (k, v) => store.set(k, v),
    removeStorageSync: (k) => store.delete(k),
    getStorageInfoSync: () => ({ keys: [...store.keys()] }),
    getFileSystemManager: () => ({
      mkdirSync() {},
      copyFile({ srcPath, destPath, success }) {
        assert(files.has(srcPath));
        files.add(destPath);
        success();
      },
      accessSync(path) {
        if (!files.has(path)) throw Error('missing');
      },
      unlink({ filePath }) {
        files.delete(filePath);
        removed.push(filePath);
      },
    }),
  };
  const draftContext = {
    wx,
    module: { exports: {} },
    require: () => ({ configuredOrigin: () => session.origin }),
  };
  vm.runInNewContext(
    fs.readFileSync('miniprogram/services/checkin-draft.js', 'utf8'),
    draftContext,
  );
  const draft = draftContext.module.exports;
  await draft.save('fixture', 'publish', '', {
    photo: 'one',
    photos: [
      { id: 'a', path: 'one' },
      { id: 'b', path: 'two' },
    ],
  });
  const first = draft.load('fixture', 'publish', '');
  assert.equal(first.photos.length, 2);
  const b = first.photos[1].path;
  await draft.save('fixture', 'publish', '', {
    photo: 'two',
    photos: [
      { id: 'b', path: 'two' },
      { id: 'c', path: 'three' },
    ],
  });
  const second = draft.load('fixture', 'publish', '');
  assert.equal(second.photos[0].path, b, 'Reordering must reuse the stored photo');
  assert(removed.includes(first.photos[0].path), 'Removed photos release their local files');
  draft.remove('fixture', 'publish', '');
  assert(second.photos.every((p) => !files.has(p.path)));
  // Native gallery: a new cover must determine the submitted media order, every photo is removable.
  const requests = [];
  const native = {
    module: { exports: {} },
    Page: (v) => {
      opts = v;
    },
    wx: { showToast() {}, switchTab() {} },
    require: (name) =>
      name.endsWith('/page')
        ? { pageOptions: (v) => v }
        : name.endsWith('/api')
          ? {
              session: () => session,
              request: async (url, method, body) => {
                requests.push({ url, method, body });
                return { id: body?.submissionId || 'point' };
              },
              message() {},
            }
          : name.endsWith('/photo')
            ? { dataURL: async (p) => p }
            : name.endsWith('/checkin-draft')
              ? { save: async () => {}, remove() {} }
              : name.endsWith('/model')
                ? { uuid: () => 'fixture-uuid' }
                : {},
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/publish/index.js', 'utf8'), native);
  const page = {
    ...opts,
    data: {
      ...opts.data,
      name: '新发现',
      description: '校园里的一处新发现',
      condition: '公共区域',
    },
    setData(v) {
      Object.assign(this.data, v);
    },
    owner: 'fixture',
    coordinate: { lat: 38, lng: 106 },
    submission: 'submission',
    mediaIds: {},
    persist: async () => true,
  };
  const a = { id: 'a', path: 'one', uploadId: 'upload-a' },
    c = { id: 'c', path: 'three', uploadId: 'upload-c' };
  page.data.photos = [a, c];
  page.data.activePhoto = c;
  await page.cover();
  assert.equal(page.data.photos[0].id, 'c');
  assert.equal(page.data.photos[0].label, '封面');
  assert.equal(page.data.photos[1].position, 2);
  assert.equal(page.data.canAddPhotos, true);
  await page.submit();
  const posted = requests.find((r) => r.url === '/api/points').body;
  assert.equal(posted.mediaId, 'upload-c');
  assert.deepEqual(Array.from(posted.mediaIds), ['upload-c', 'upload-a']);
  page.completed = false;
  page.data.saving = false;
  page.data.deletePhotoId = 'c';
  await page.photoRemove();
  assert.equal(page.data.photos.length, 1);
  assert.equal(page.data.photo, 'one');
  assert.equal(page.data.photos[0].label, '封面', 'Removing the cover promotes the next photo');
  page.data.photos = Array.from({ length: 9 }, (_, i) => ({ id: String(i), path: String(i) }));
  page.data.activePhoto = page.data.photos[8];
  await page.cover();
  assert.equal(
    page.data.canAddPhotos,
    false,
    'The add tile disappears only at the nine-photo limit',
  );
  assert.equal(page.data.photoCount, 9);
  console.log(
    'PASS v8.0.0 bounded Unicode reply reveal, nine-photo account-scoped draft cleanup, native cover ordering and removal.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
