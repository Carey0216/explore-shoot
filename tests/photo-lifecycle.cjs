const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
(async () => {
  const { prepareDraftPhoto, discardDraftPhoto, releaseDraftUpload, photoPicker } = await import(
    'data:text/javascript;base64,' + fs.readFileSync('dist/shared/ui.js').toString('base64')
  );
  global.location = { href: 'http://explore.localhost:4294/#publish' };
  const requests = [],
    uploads = [],
    statuses = new Map();
  let pendingXHR,
    auto = true;
  global.fetch = async (path, options = {}) => {
    requests.push({ path, method: options.method || 'GET' });
    const result =
      options.method === 'DELETE'
        ? { status: 200, body: { ok: true } }
        : statuses.get(path) || { status: 404, body: { error: 'gone' } };
    return { status: result.status, text: async () => JSON.stringify(result.body) };
  };
  global.XMLHttpRequest = class {
    constructor() {
      this.upload = {};
    }
    open(method, url) {
      assert.equal(method, 'POST');
      assert(url.endsWith('/api/media'));
    }
    setRequestHeader() {}
    send(body) {
      uploads.push(JSON.parse(body));
      pendingXHR = this;
      if (auto) queueMicrotask(() => this.respond());
    }
    respond() {
      const id = crypto.randomUUID();
      this.status = 201;
      this.responseText = JSON.stringify({ id, url: '/media/' + id });
      statuses.set('/api/media/' + id, {
        status: 200,
        body: { id, url: '/media/' + id, attached: false },
      });
      this.onload();
    }
    abort() {
      this.onabort();
    }
  };
  const makeDraft = (photo = null, uploaded = null) => {
    let value = { photo, uploaded };
    return {
      flush: async () => {},
      read: async () => structuredClone(value),
      update: async (patch) => Object.assign(value, patch),
      clear: async () => {
        value = {};
      },
      reopen() {},
    };
  };
  const photo = 'data:image/jpeg;base64,fixture';
  let draft = makeDraft(photo),
    first = prepareDraftPhoto(draft),
    second = prepareDraftPhoto(draft);
  assert.equal(first, second);
  const saved = await first;
  assert.equal(uploads.length, 1);
  assert.equal(saved.preview, photo);
  assert.equal((await draft.read()).uploaded.id, saved.id);
  assert.equal((await prepareDraftPhoto(draft)).id, saved.id);
  assert.equal(uploads.length, 1, 'Retry reuses acknowledged upload');
  statuses.set('/api/media/' + saved.id, { status: 410, body: { error: 'expired' } });
  const recovered = await prepareDraftPhoto(draft);
  assert.notEqual(recovered.id, saved.id);
  assert.equal(uploads.length, 2, 'Expired server copy is reuploaded from the local draft');
  await discardDraftPhoto(draft);
  await Promise.resolve();
  assert.deepEqual(await draft.read(), {});
  assert(requests.some((r) => r.path === '/api/media/' + recovered.id && r.method === 'DELETE'));
  const blocked = crypto.randomUUID();
  draft = makeDraft(photo, { id: blocked });
  statuses.set('/api/media/' + blocked, {
    status: 503,
    body: { error: 'temporarily unavailable' },
  });
  const before = uploads.length;
  await assert.rejects(prepareDraftPhoto(draft), /temporarily unavailable/);
  assert.equal(uploads.length, before, 'Do not duplicate on ambiguous server failures');
  auto = false;
  draft = makeDraft(photo);
  const stale = prepareDraftPhoto(draft);
  while (!pendingXHR || uploads.length === before) await Promise.resolve();
  await draft.update({ photo: 'data:image/jpeg;base64,newer' });
  pendingXHR.respond();
  await assert.rejects(stale, /照片已更换/);
  assert.equal((await draft.read()).uploaded, null);
  auto = true;
  const unavailable = {
    flush: async () => {},
    read: async () => {
      throw Error('storage unavailable');
    },
    update: async () => {
      throw Error('quota');
    },
  };
  assert.equal(
    (await prepareDraftPhoto(unavailable, { fallback: { url: photo } })).preview,
    photo,
    'Current-page fallback still submits when local storage is blocked',
  );
  await releaseDraftUpload({ id: '../../private' });
  assert(!requests.some((r) => r.path.includes('..')));
  // Exercise the real picker callback with a decoded photo and a small DOM fixture: no upload before publish.
  let dialog = null,
    toast = null;
  const node = (tag) => ({
    tag,
    style: {},
    firstElementChild: { style: {} },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    focus() {},
    getBoundingClientRect() {
      return {};
    },
    closest() {
      return this;
    },
    close() {},
    remove() {
      this.isConnected = false;
      if (this === dialog) dialog = null;
    },
    showModal() {},
    isConnected: true,
  });
  const children = new Map();
  global.document = {
    activeElement: node('button'),
    querySelector: (s) => (s === '#dialog' ? dialog : s === '#toast' ? toast : null),
    body: {
      append: (n) => {
        if (n.tag === 'dialog') dialog = n;
        else if (n.id === 'toast') toast = n;
      },
    },
    createElement: (tag) => {
      if (tag === 'canvas')
        return { getContext: () => ({ drawImage() {} }), toDataURL: () => photo };
      const n = node(tag);
      if (tag === 'dialog')
        n.querySelector = (s) => {
          if (!children.has(s)) children.set(s, node(s));
          return children.get(s);
        };
      return n;
    },
  };
  global.createImageBitmap = async () => ({ width: 600, height: 400, close() {} });
  let model;
  draft = makeDraft();
  const uploadsBeforePicker = uploads.length;
  photoPicker(
    async (m) => {
      model = m;
    },
    { draft, keepDraft: true },
  );
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const file = children.get('#photo-file');
  await file.onchange({ target: { files: [{ size: 100 }] } });
  assert.equal(
    uploads.length,
    uploadsBeforePicker,
    'Picking a publish/check-in photo must not upload it',
  );
  assert.equal(model.local, true);
  assert.equal(model.url, photo);
  assert.equal((await draft.read()).photo, photo);
  assert.equal(dialog, null);
  console.log(
    'PASS photo lifecycle: picker stays local, deferred upload, deduplicated retry, expired copy recovery, discard release, ambiguous failure, stale selection and blocked local storage.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
