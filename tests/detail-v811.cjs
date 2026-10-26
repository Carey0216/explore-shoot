const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const webGuide = fs.readFileSync('dist/shared/assistant-guidance.js', 'utf8');
  const guide = {};
  vm.runInNewContext(
    webGuide.replaceAll('export function ', 'function ') +
      ';Object.assign(result,{assistantGuidance,assistantLinkLabel})',
    { result: guide },
  );
  for (const file of [
    'dist/shared/assistant-guidance.js',
    'miniprogram/services/assistant-guidance.js',
  ]) {
    const code = fs
      .readFileSync(file, 'utf8')
      .replaceAll('export function ', 'function ')
      .replace(/module.exports[^;]+;/, '');
    const exports = {};
    vm.runInNewContext(code + ';Object.assign(result,{assistantGuidance,assistantLinkLabel})', {
      result: exports,
    });
    for (const path of [
      '#publish',
      '#settings',
      '#plans',
      '#contact',
      '#guides',
      '#me',
      '#shots',
    ]) {
      const link = { path, title: '相机打不开怎么办？' };
      assert.equal(
        JSON.stringify(exports.assistantGuidance(link)),
        JSON.stringify(guide.assistantGuidance(link)),
      );
      assert(exports.assistantGuidance(link).every((s) => s.web && s.mini && s.copy.length > 30));
    }
    assert.equal(exports.assistantGuidance({ path: 'javascript:alert(1)' }).length, 0);
  }
  // Regression: the ordinary admin table must render with no runtime/ops variable in scope.
  const admin = fs.readFileSync('dist/admin/app.js', 'utf8');
  const table = admin.slice(admin.indexOf('function table('), admin.indexOf('function tabs('));
  const sandbox = { esc: String };
  vm.runInNewContext(table + ';result=table(["昵称"],["<tr><td>测试</td></tr>"]);', sandbox);
  assert(sandbox.result.includes('data-label="昵称"'));
  assert(!sandbox.result.includes('运行与恢复'));

  const storage = new Map(),
    requests = [],
    removed = [];
  let clears = 0,
    origin = 'https://campus.example.test';
  const state = { globalData: {} },
    modules = new Map();
  const wx = {
    env: { USER_DATA_PATH: '/local' },
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getFileSystemManager: () => ({ accessSync() {}, unlink: (o) => removed.push(o.filePath) }),
    request: (o) => requests.push(o),
  };
  function load(name) {
    if (name === './network')
      return {
        configuredOrigin: () => origin,
        backendOrigin: () => origin,
        failure: () => Error('网络中断，请重试'),
      };
    if (name === './request-cache') return { clear() {}, read: (_k, fn) => fn() };
    if (name === './public-offline') return { get: () => null, put() {}, remove() {} };
    if (modules.has(name)) return modules.get(name);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync('miniprogram/services/' + name.slice(2) + '.js', 'utf8'), {
      module,
      require: load,
      wx,
      getApp: () => state,
      Date,
      Set,
      Map,
      Promise,
    });
    modules.set(name, module.exports);
    return module.exports;
  }
  const api = load('./api'),
    drafts = load('./checkin-draft');
  const a = { id: 'alice' },
    b = { id: 'bob' },
    token = 'a'.repeat(64);
  api.saveSession({ token, account: a, expiresAt: Date.now() + 60000 });
  const draftKey = 'campus-mini-draft-v7:' + encodeURIComponent(origin) + ':alice:publish:';
  storage.set(draftKey, {
    at: Date.now(),
    name: '未完成的发现',
    photos: [{ id: 'one', path: '/local/campus-drafts-v7/photo.jpg', mediaId: 'uploaded' }],
  });
  const task = api.request('/api/my/library');
  requests.pop().success({ statusCode: 401, data: { error: 'expired' } });
  await assert.rejects(task, /登录已过期.*草稿/);
  assert.equal(api.session(), null);
  assert(storage.has(draftKey));
  assert(!removed.includes('/local/campus-drafts-v7/photo.jpg'));
  api.saveSession({ token, account: b, expiresAt: Date.now() + 60000 });
  assert.equal(drafts.load('bob', 'publish', ''), null);
  api.saveSession({ token, account: a, expiresAt: Date.now() + 60000 });
  assert.equal(drafts.load('alice', 'publish', '').photos[0].mediaId, 'uploaded');
  api.clearSession();
  assert(!storage.has(draftKey));
  assert(removed.includes('/local/campus-drafts-v7/photo.jpg'));
  api.saveSession({ token, account: a, expiresAt: Date.now() + 60000 });
  storage.set(draftKey, { at: Date.now(), name: '过期时仍保留' });
  const session = storage.get('explore-mini-session-v1');
  session.expiresAt = Date.now() - 1;
  api.removeExpiredSession();
  assert(storage.has(draftKey));
  api.saveSession({ token, account: a, expiresAt: Date.now() + 60000 });
  origin = 'https://another.example.test';
  assert.equal(api.session(), null);
  assert(!storage.has(draftKey), 'Switching backend keeps the explicit privacy reset');

  // No sensitive API before the user action reaches privacy authorization.
  let auth,
    media = 0;
  const privacy = {
    module: { exports: {} },
    wx: { requirePrivacyAuthorize: (o) => (auth = o) },
    Promise,
    Error,
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/privacy.js', 'utf8'), privacy);
  const photo = {
    module: { exports: {} },
    require: () => privacy.module.exports,
    wx: {
      chooseMedia: (o) => {
        media++;
        o.success({ tempFiles: [{ tempFilePath: 'photo' }] });
      },
    },
    Promise,
    Error,
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/photo.js', 'utf8'), photo);
  const choose = photo.module.exports.choose();
  assert.equal(media, 0);
  auth.fail();
  await assert.rejects(choose, /内容已保留/);
  assert.equal(media, 0);
  const accepted = photo.module.exports.choose();
  auth.success();
  assert.equal(await accepted, 'photo');
  assert.equal(media, 1);
  // Two-photo interruption: an already uploaded photo survives a reconstructed editor.
  let pageDefinition,
    lastDraft,
    completedDrafts = 0,
    failSecond = true;
  const uploaded = [],
    posted = [];
  const publishAPI = {
    session: () => ({ account: { id: 'fixture' } }),
    request: async (url, method, value) => {
      if (url === '/api/media' && method === 'POST') {
        uploaded.push(value.photo);
        if (value.photo === 'second' && failSecond) throw Error('上传中断');
        return { id: value.photo === 'first' ? 'uploaded-first' : 'uploaded-second' };
      }
      if (url === '/api/points') {
        posted.push(value);
        return {};
      }
      return {};
    },
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/publish/index.js', 'utf8'), {
    Page: (d) => (pageDefinition = d),
    require: (name) =>
      name.endsWith('/api')
        ? publishAPI
        : name.endsWith('/photo')
          ? { dataURL: async (p) => p }
          : name.endsWith('/model')
            ? { uuid: () => 'fixture-id' }
            : name.endsWith('/checkin-draft')
              ? {
                  save: async (_a, _b, _c, v) => {
                    lastDraft = JSON.parse(JSON.stringify(v));
                  },
                  remove: () => completedDrafts++,
                }
              : name.endsWith('/page')
                ? { pageOptions: (d) => d }
                : {},
    wx: { showToast() {}, switchTab() {} },
    Promise,
    Error,
    Object,
  });
  const editor = (photos) => {
    const page = {
      data: {
        ...pageDefinition.data,
        name: '校园照片',
        description: '在这里拍下的校园',
        condition: '白天开放',
        photos,
      },
      owner: 'fixture',
      coordinate: { lat: 38.496, lng: 106.107 },
      submission: 'stable-submission',
      setData(v) {
        Object.assign(this.data, v);
      },
    };
    for (const [k, v] of Object.entries(pageDefinition))
      if (typeof v === 'function') page[k] = v.bind(page);
    return page;
  };
  const interrupted = editor([
    { id: 'one', path: 'first', uploadId: 'stable-one' },
    { id: 'two', path: 'second', uploadId: 'stable-two' },
  ]);
  await interrupted.submit();
  assert.match(interrupted.data.error, /上传中断.*内容已保留/);
  assert.equal(lastDraft.photos[0].mediaId, 'uploaded-first');
  assert.equal(completedDrafts, 0);
  failSecond = false;
  const restored = editor(lastDraft.photos);
  await restored.submit();
  assert.deepEqual(uploaded, ['first', 'second', 'second']);
  assert.equal(posted.length, 1);
  assert.deepEqual(Array.from(posted[0].mediaIds), ['uploaded-first', 'uploaded-second']);
  assert.equal(completedDrafts, 1);
  let imageDefinition;
  vm.runInNewContext(fs.readFileSync('miniprogram/components/remote-image/index.js', 'utf8'), {
    Component: (d) => (imageDefinition = d),
    require: (name) =>
      name.endsWith('/localization')
        ? { component: (d) => d }
        : { retainFile() {}, releaseFile() {} },
  });
  const image = {
    serial: 2,
    data: { loading: true },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  imageDefinition.methods.loaded.call(image, { currentTarget: { dataset: { serial: 1 } } });
  assert.equal(image.data.loading, true);
  imageDefinition.methods.loaded.call(image, { currentTarget: { dataset: { serial: 2 } } });
  assert.equal(image.data.loading, false);

  let stack = [],
    shown = 0;
  const pageModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/page.js', 'utf8'), {
    module: pageModule,
    getCurrentPages: () => stack,
    getApp: () => ({ globalData: {} }),
    wx: {},
    require: (name) =>
      name === './features'
        ? {
            snapshot: () => ({}),
            load: async () => ({}),
            forPage: () => null,
            enabled: () => true,
            allow: () => true,
            methods: {},
          }
        : name === './appearance'
          ? { snapshot: () => ({}), account() {}, subscribe: () => () => {} }
          : name === './api'
            ? { session: () => null }
            : name === './network'
              ? { configuredOrigin: () => 'fixture' }
              : name === './public-content'
                ? { show() {}, hide() {} }
                : name === './localization'
                  ? { page: (d) => d }
                  : { consume() {} },
  });
  const options = pageModule.exports.pageOptions({
    data: {},
    onShow() {
      shown++;
    },
  });
  const host = {
    data: { ...options.data },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  await options.onShow.call(host);
  assert.equal(shown, 0, 'Do not render using an unknown route');
  host.route = 'pages/discover/index';
  stack = [host];
  options.onReady.call(host);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(shown, 1);
  assert.equal(host.data.nativePage, 'discover');
  const { chatHeight } = require('../miniprogram/services/chat-layout');
  const shortChat = chatHeight({
    windowHeight: 834,
    contentHeight: 180,
    chromeHeight: 130,
    weather: true,
  });
  const longChat = chatHeight({
    windowHeight: 834,
    contentHeight: 1500,
    chromeHeight: 130,
    weather: true,
  });
  assert(shortChat < 360, 'A single exchange must not occupy a fixed 64vh sheet');
  assert(longChat > shortChat && longChat <= 834 * 0.65 + 1);
  for (const windowHeight of [568, 667, 834])
    for (const keyboardHeight of [0, 300, 360]) {
      const height = chatHeight({
        windowHeight,
        keyboardHeight,
        contentHeight: 1000,
        chromeHeight: 100,
        weather: !keyboardHeight,
      });
      assert(height <= windowHeight - keyboardHeight - 20);
      assert(height >= 120);
    }
  console.log(
    'PASS v8.1.1: shared destination guidance, admin table without runtime state, expired-login draft/photo recovery, account/backend isolation, explicit logout cleanup and opt-in privacy.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
