const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const { pose, duration, impactAt } = require('../miniprogram/services/landing-motion');
const { diagnosticContext } = require('../miniprogram/services/diagnostic-context');
const esm = (p) =>
  import(
    'data:text/javascript;base64,' + Buffer.from(fs.readFileSync(p, 'utf8')).toString('base64')
  );
(async () => {
  assert.equal(duration, 1100);
  assert.equal(pose(0).scale, 3.2);
  assert.equal(pose(0).drop, -96);
  assert(!pose(impactAt - 1).landed);
  assert(pose(impactAt).landed);
  assert(pose(impactAt).scale < 1);
  assert(Math.abs(pose(duration).scale - 1) < 0.001);
  assert(Math.abs(pose(duration).drop) < 0.02);
  const context = diagnosticContext(
    'pages/contact/index',
    'https://test.invalid/api/messages/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?token=secret',
    404,
  );
  assert.equal(context.page, 'contact');
  assert.match(context.resource, /^private-attachment@[a-f0-9]{8}$/);
  assert(!JSON.stringify(context).includes('secret'));
  assert(!context.resource.includes('aaaa-'));
  assert.equal(
    diagnosticContext('#shots', '/shared/icons/search.svg').resource,
    '/shared/icons/search.svg',
  );
  assert(
    !diagnosticContext(
      '#shots',
      '/api/shooting-spots/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ).resource.includes('aaaa-'),
  );
  // Rotation must preserve a 96 CSS-pixel vertical drop, regardless of panorama source resolution.
  let decoded,
    landingTimers = [],
    animations = [],
    impact = false;
  const group = {
    dataset: { atlasBuilding: 'photo:test' },
    style: {},
    removeAttribute() {},
    animate(frames, options) {
      animations.push({ frames, options });
      return { cancel() {} };
    },
  };
  const svg = { getBoundingClientRect: () => ({ width: 320 }), querySelectorAll: () => [group] };
  const status = { textContent: '' },
    replay = {},
    dialog = {
      isConnected: true,
      dataset: {},
      classList: { add() {}, remove() {} },
      querySelectorAll: () => [group],
      querySelector: (s) =>
        s === '.passport-atlas' ? svg : s === '[data-landing-status]' ? status : replay,
    };
  const landing = {};
  vm.runInNewContext(
    fs.readFileSync('dist/shared/atlas-landing.js', 'utf8').replace('export function', 'function') +
      ';this.play=playAtlasLanding',
    {
      ...landing,
      Image: class {
        decode() {
          return new Promise((r) => {
            decoded = r;
          });
        }
      },
      document: {
        body: {
          classList: {
            add() {
              impact = true;
            },
            remove() {
              impact = false;
            },
          },
        },
      },
      navigator: { vibrate() {} },
      performance: { now: () => 594 },
      setTimeout: (fn, ms) => {
        landingTimers.push({ fn, ms });
        return 1;
      },
      clearTimeout() {},
      Set,
    },
  );
  // Use a separate context so exported bindings remain inspectable.
  const box = {
    Image: class {
      decode() {
        return new Promise((r) => {
          decoded = r;
        });
      }
    },
    document: {
      body: {
        classList: {
          add() {
            impact = true;
          },
          remove() {
            impact = false;
          },
        },
      },
    },
    navigator: { vibrate() {} },
    performance: { now: () => 594 },
    setTimeout: (fn, ms) => {
      landingTimers.push({ fn, ms });
      return 1;
    },
    clearTimeout() {},
    Set,
  };
  vm.runInNewContext(
    fs.readFileSync('dist/shared/atlas-landing.js', 'utf8').replace('export function', 'function') +
      ';this.play=playAtlasLanding',
    box,
  );
  const stop = box.play(dialog, {
    buildings: [{ id: 'photo:test' }],
    atlas: {
      photoURL: '/shared/map.jpg',
      photoHeight: 3200,
      buildings: [
        {
          id: 'photo:test',
          outline: [
            [100, 200],
            [200, 200],
            [200, 300],
            [100, 300],
          ],
        },
      ],
    },
  });
  assert.equal(animations.length, 0, 'Animation must wait for decoded map pixels');
  decoded();
  await new Promise(setImmediate);
  assert.equal(animations.length, 1);
  assert.match(animations[0].frames[0].transform, /translate\(960px,0px\) scale\(3.2\)/);
  assert.equal(landingTimers[0].ms, 594);
  landingTimers[0].fn();
  assert(impact);
  stop();
  assert(!impact);
  // Text drag scrolls inside its textarea, never the surrounding modal or page.
  const listeners = new Map(),
    win = new Map(),
    parent = {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 80,
      scrollLeft: 0,
      parentElement: null,
    },
    field = { parentElement: parent, matches: () => true };
  const root = {
      addEventListener: (k, v) => listeners.set(k, v),
      removeEventListener: (k) => listeners.delete(k),
    },
    page = { scrollTop: 120, scrollLeft: 0 };
  const editor = {
    document: { body: {}, scrollingElement: page, addEventListener() {}, removeEventListener() {} },
    window: {
      addEventListener: (k, v) => win.set(k, v),
      removeEventListener: (k) => win.delete(k),
    },
  };
  vm.runInNewContext(
    fs
      .readFileSync('dist/shared/editor-stability.js', 'utf8')
      .replace('export function', 'function') + ';this.bind=stabilizeEditor',
    editor,
  );
  const cleanup = editor.bind(root);
  listeners.get('pointerdown')({ button: 0, pointerType: 'mouse', target: field });
  parent.scrollTop = 400;
  listeners.get('scroll')({ target: parent });
  assert.equal(parent.scrollTop, 80);
  field.scrollTop = 200;
  listeners.get('scroll')({ target: field });
  assert.equal(field.scrollTop, 200);
  win.get('pointerup')();
  assert(!listeners.has('scroll'));
  cleanup();
  // Native byte progress aborts stale-account tasks and never accepts their private result.
  let token = 'one',
    uploadOptions,
    progress,
    aborted = false;
  const uploadBox = {
    module: { exports: {} },
    require: () => ({ configuredOrigin: () => 'https://test.invalid' }),
    wx: {
      uploadFile: (o) => {
        uploadOptions = o;
        return {
          onProgressUpdate: (fn) => (progress = fn),
          abort() {
            aborted = true;
          },
        };
      },
    },
    Promise,
    Error,
    JSON,
    Math,
  };
  vm.runInNewContext(
    fs.readFileSync('miniprogram/services/private-file-upload.js', 'utf8'),
    uploadBox,
  );
  let value = 0;
  const uploaded = uploadBox.module.exports.upload(
    { session: () => ({ token }) },
    'https://test.invalid/api/mini/messages/files',
    'private-file',
    { submissionId: 'same' },
    (p) => (value = p),
  );
  progress({ progress: 47 });
  assert.equal(value, 47);
  token = 'two';
  progress({ progress: 80 });
  assert(aborted);
  uploadOptions.success({ statusCode: 201, data: '{"id":"old"}' });
  await assert.rejects(uploaded, /账号已改变/);
  const diagnosis = await esm('dist/shared/image-diagnostics.js');
  global.location = { href: 'https://test.invalid/#shots', origin: 'https://test.invalid' };
  global.fetch = async () => ({ ok: false, status: 404 });
  const failed = await diagnosis.diagnoseImage('/media/test');
  assert.equal(failed.kind, 'image-address');
  assert.equal(failed.status, 404);
  // A reward follows its owner across page destruction instead of being consumed by a leaving page.
  const app = { globalData: {} },
    client = { session: () => ({ account: { id: 'owner-a' } }), asset: (x) => x };
  const pageBox = {
    module: { exports: {} },
    require: (name) =>
      name === './api'
        ? client
        : name === './network'
          ? { configuredOrigin: () => 'https://test.invalid' }
          : name === './features'
            ? { methods: {}, snapshot: () => ({}) }
            : name === './appearance'
              ? { snapshot: () => ({}) }
              : name === './share-brand'
                ? { install() {} }
                : name === './localization'
                  ? { page: (x) => x }
                  : name === './public-content'
                    ? { hide() {} }
                    : {},
    getApp: () => app,
    setTimeout: () => 1,
    clearTimeout() {},
    JSON,
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/page.js', 'utf8'), pageBox);
  const def = pageBox.module.exports.pageOptions({ data: {} }),
    create = () => ({
      ...def,
      data: JSON.parse(JSON.stringify(def.data)),
      nativeVisible: true,
      setData(p) {
        Object.assign(this.data, p);
      },
      getTabBar: () => ({ setData() {} }),
    });
  const receipt = {
    owner: 'owner-a',
    origin: 'https://test.invalid',
    events: {
      revisit: { atlas: { buildings: [] }, buildings: [{ id: 'photo:test', title: 'A' }] },
      recorded: true,
    },
  };
  app.globalData.pendingPassportRewards = receipt;
  const firstPage = create();
  firstPage.presentPendingRewards813();
  assert.equal(firstPage.data.nativeRewardItems812.length, 1);
  firstPage.onHide();
  assert.equal(app.globalData.pendingPassportRewards, receipt);
  assert.equal(firstPage.data.nativeRewardItems812.length, 0);
  const nextPage = create();
  nextPage.presentPendingRewards813();
  assert.equal(nextPage.data.nativeRewardItems812.length, 1);
  assert.equal(nextPage.data.nativeRewardItems812[0].revealKey, 'photo:test');
  nextPage.dismissNativeRewards812();
  nextPage.onHide();
  assert.equal(app.globalData.pendingPassportRewards, null);
  const wrongOwner = create();
  app.globalData.pendingPassportRewards = { ...receipt, owner: 'another' };
  wrongOwner.presentPendingRewards813();
  assert.equal(wrongOwner.data.nativeRewardItems812.length, 0);
  // A late save from a previous page cannot resurrect a successfully submitted draft.
  const storage = new Map([
      ['explore-mini-session-v1', { account: { id: 'owner-a' }, origin: 'https://test.invalid' }],
    ]),
    draftBox = {
      module: { exports: {} },
      require: () => ({ configuredOrigin: () => 'https://test.invalid' }),
      wx: {
        env: { USER_DATA_PATH: '/tmp' },
        getStorageSync: (k) => storage.get(k),
        setStorageSync: (k, v) => storage.set(k, v),
        removeStorageSync: (k) => storage.delete(k),
        getFileSystemManager: () => ({ mkdirSync() {}, unlink() {} }),
      },
      Set,
      Date,
      Math,
    };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/checkin-draft.js', 'utf8'), draftBox);
  const drafts = draftBox.module.exports;
  await drafts.save('owner-a', 'point', '', { note: 'first', submissionId: 'receipt-one' });
  drafts.remove('owner-a', 'point', '', 'receipt-one');
  await drafts.save('owner-a', 'point', '', { note: 'late', submissionId: 'receipt-one' });
  assert.equal(drafts.load('owner-a', 'point', ''), null);
  await drafts.save('owner-a', 'point', '', { note: 'new', submissionId: 'receipt-two' });
  assert.equal(drafts.load('owner-a', 'point', '').note, 'new');
  // A failed replacement save keeps its picker open and its proposed stop available for retry.
  let closed = 0;
  const submit = {},
    hint = {},
    replacementForm = {
      elements: { point: { value: 'point' }, spot: { value: 'new-spot' } },
      querySelector: () => submit,
    };
  const replacementBox = {
    modal: (_title, _html, setup) => setup({ isConnected: true }),
    $: (selector) => (selector === 'form' ? replacementForm : hint),
    esc: (v) => v,
    errorHTML: '',
    api: async () => ({ items: [{ id: 'new-spot', title: 'New stop', pointId: 'point' }] }),
    formSubmit: (_event, work) => work(),
    closeModal: () => closed++,
  };
  vm.runInNewContext(
    fs
      .readFileSync('dist/user/plan-next.js', 'utf8')
      .replace(/^import .*;\r?\n/gm, '')
      .replace(/export function/g, 'function')
      .replace(/export async function/g, 'async function') + ';this.replace=replacePlanStop;',
    replacementBox,
  );
  const replacement = { items: [{ id: 'one', spotId: 'old-spot' }] };
  replacementBox.replace(replacement, 0, [], async () => false);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(replacementForm.onsubmit({}), /未保存安排/);
  assert.equal(closed, 0);
  assert.equal(replacement.items[0].spotId, 'new-spot');
  replacementBox.replace(replacement, 0, [], async () => true);
  await new Promise((resolve) => setImmediate(resolve));
  await replacementForm.onsubmit({});
  assert.equal(closed, 1);
  console.log(
    'PASS v8.1.3: decoded-image landing, rotation and impact timing; safe diagnostic resources; stable selection; measured native upload progress, stale-session isolation, cross-page receipts and sealed submitted drafts.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
