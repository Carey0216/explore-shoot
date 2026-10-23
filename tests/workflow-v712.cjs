const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const moduleFrom = (s, suffix = '') =>
  import('data:text/javascript;base64,' + Buffer.from(s).toString('base64') + '#' + suffix);
(async () => {
  const storage = new Map(),
    downloads = [],
    removed = [];
  const wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    getFileSystemManager: () => ({ unlink: (o) => removed.push(o.filePath) }),
    downloadFile: (o) => downloads.push(o),
  };
  const app = { globalData: {} };
  const context = {
    module: { exports: {} },
    require: (n) =>
      n === './request-cache'
        ? require('../miniprogram/services/request-cache')
        : n === './network'
          ? {
              backendOrigin: () => 'https://campus.example',
              configuredOrigin: () => 'https://campus.example',
              failure: () => Error('network'),
            }
          : n === './public-offline'
            ? {
                put() {},
                get() {
                  return null;
                },
                remove() {},
              }
            : n === './checkin-draft'
              ? { clear() {} }
              : { uuid: () => crypto.randomUUID() },
    wx,
    getApp: () => app,
    Date,
    Promise,
    Set,
    Map,
    Error,
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/api.js', 'utf8'), context);
  const api = context.module.exports;
  api.saveSession({
    token: 'a'.repeat(64),
    expiresAt: Date.now() + 60000,
    account: { id: 'alice' },
  });
  const path = '/api/messages/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const first = api.download(path),
    second = api.download(path);
  assert.equal(first, second);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].header.Authorization, 'Bearer ' + 'a'.repeat(64));
  downloads.shift().success({ statusCode: 200, tempFilePath: '/private/alice-thumb.jpg' });
  assert.equal(await first, '/private/alice-thumb.jpg');
  assert.equal(await api.download(path), '/private/alice-thumb.jpg');
  assert.equal(downloads.length, 0);
  api.forgetImage(path);
  const retry = api.download(path);
  assert.equal(downloads.length, 1);
  downloads.shift().fail({});
  await assert.rejects(retry, /network/);
  const full = api.download(path, false);
  assert.equal(downloads.length, 1);
  assert(!downloads[0].url.includes('size=thumb'));
  api.clearSession();
  downloads.shift().success({ statusCode: 200, tempFilePath: '/private/stale.jpg' });
  await assert.rejects(full, /照片不可用/);
  assert(removed.includes('/private/alice-thumb.jpg'));
  assert(removed.includes('/private/stale.jpg'));
  await assert.rejects(api.download('https://outside.example/photo'), /照片不可用/);

  const actions = [],
    globals = {};
  let links;
  vm.runInNewContext(fs.readFileSync('miniprogram/services/links.js', 'utf8'), {
    module: {
      get exports() {
        return links;
      },
      set exports(v) {
        links = v;
      },
    },
    require: () => ({
      requireLogin: () => true,
      message: () => {},
      request: async () => ({ pointId: 'nmu1', id: 'spot1' }),
    }),
    getApp: () => ({ globalData: globals }),
    getCurrentPages: () => [],
    wx: {
      switchTab: (o) => actions.push(o.url),
      navigateTo: (o) => actions.push(o.url),
      showModal: () => {},
    },
    encodeURIComponent,
    String,
  });
  await links.open('#navigate');
  assert.equal(globals.mapTab, 'navigation');
  await links.open('#routes');
  assert.equal(globals.mapTab, 'explore');
  await links.open('#support');
  assert.equal(actions.at(-1), '/pages/assistant/index?purpose=support');
  await links.open('#shared-plan/' + 'b'.repeat(64));
  assert.equal(actions.at(-1), '/pages/plan-share/index?id=' + 'b'.repeat(64));

  global.location = { pathname: '/admin/', href: 'https://campus.example/admin/' };
  global.document = { body: { dataset: { audience: 'admin' } } };
  const richSource = fs
    .readFileSync('dist/shared/rich-message.js', 'utf8')
    .replace(/^import .*;\r?\n/, '');
  const rich = await moduleFrom("const esc=s=>String(s??'');\n" + richSource);
  const html = rich.richHTML({
    image: '/admin/api/messages/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    message: '配图',
  });
  assert(html.includes('src="/admin/api/messages/media/'));
  assert(!html.includes('/admin/admin/'));
  assert.equal(rich.safeTarget('javascript:alert(1)'), '');
  assert.equal(rich.safeTarget('#shared-plan/' + 'c'.repeat(64)), '#shared-plan/' + 'c'.repeat(64));

  let xhr;
  const sent = [];
  global.XMLHttpRequest = class {
    constructor() {
      this.upload = {};
      xhr = this;
    }
    open() {}
    setRequestHeader() {}
    send(body) {
      sent.push(JSON.parse(body));
    }
    abort() {
      this.onabort();
    }
  };
  let saved = { photo: 'data:image/jpeg;base64,fixture-photo' };
  const draft = {
    flush: async () => {},
    read: async () => structuredClone(saved),
    update: async (p) => {
      saved = { ...saved, ...p };
    },
  };
  const uiSource = fs.readFileSync('dist/shared/ui.js', 'utf8');
  const one = await moduleFrom(uiSource, 'initial');
  const pending = one.prepareDraftPhoto(draft);
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent.length, 1);
  const original = sent[0].submissionId;
  xhr.onerror();
  await assert.rejects(pending, /上传中断/);
  assert.equal(saved.photo, 'data:image/jpeg;base64,fixture-photo');
  assert.equal(saved.uploadAttempt.id, original);
  const reloaded = await moduleFrom(uiSource, 'reload');
  const resumed = reloaded.prepareDraftPhoto(draft);
  for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    sent[1].submissionId,
    original,
    'Reloaded draft must reuse upload attempt when the response was lost',
  );
  xhr.status = 201;
  xhr.responseText =
    '{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","url":"/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
  xhr.onload();
  assert.equal((await resumed).id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(saved.uploaded.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  console.log(
    'PASS v7.1.2 session-scoped image deduplication, retry eviction, private-file cleanup, cross-client links, admin media prefix, and reload-safe upload draft retry.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
