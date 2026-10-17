const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const mod = (source) =>
  import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
(async () => {
  const offline = await mod(fs.readFileSync('dist/shared/public-offline.js', 'utf8'));
  const store = {
    getItem(k) {
      return this[k] || null;
    },
    setItem(k, v) {
      this[k] = v;
    },
    removeItem(k) {
      delete this[k];
    },
  };
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    path = '/api/shooting-spots/' + id;
  const data = {
    id,
    title: '真实机位',
    pointId: 'nmu1',
    status: 'published',
    authorId: 'PRIVATE',
    myReaction: 'dislike',
    viewCount: 123,
    passwordHash: 'PRIVATE',
  };
  offline.cachePublic(path, data, store, 1000);
  const cached = offline.cachedPublic(path, store, 1100);
  assert.equal(cached.title, '真实机位');
  assert.equal(cached._offline, true);
  assert(!JSON.stringify(cached).includes('PRIVATE'));
  assert(!('myReaction' in cached));
  assert(!('viewCount' in cached));
  assert.equal(offline.publicSnapshot('/api/my/library', { private: 'secret' }), null);
  assert.equal(offline.publicSnapshot('/api/checkins', []), null);
  assert.equal(offline.cachedPublic(path, store, 1000 + 7 * 86400000), null);
  offline.cachePublic(path, data, store, 2000);
  offline.forgetPublic(path, store);
  assert.equal(offline.cachedPublic(path, store, 2001), null);
  for (let i = 0; i < 105; i++)
    offline.cachePublic(
      '/api/points/nmu' + i + '/shooting-spots',
      { spots: [data] },
      store,
      3000 + i,
    );
  assert.equal(Object.keys(store).filter((k) => k.startsWith('campus-public-v7:')).length, 100);
  let setup,
    cleanup,
    requests = 0,
    stops = 0,
    pending;
  const controls = Object.fromEntries(
    [
      'framing-start',
      'framing-opacity',
      'framing-example',
      'framing-video',
      'framing-compass',
      'framing-current',
    ].map((k) => ['#' + k, { style: {}, play: async () => {}, disabled: false }]),
  );
  const d = { open: true, addEventListener() {} };
  global.__frame = {
    $: (s) => controls[s],
    esc: (s) => String(s || ''),
    toast: () => {},
    modal: (title, html, init) => {
      setup = () => {
        cleanup = init(d);
      };
      setup();
      return d;
    },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    navigator: {
      mediaDevices: {
        getUserMedia() {
          requests++;
          return new Promise((resolve) => (pending = resolve));
        },
      },
    },
  };
  const framing = await mod(
    'const {$,esc,toast,modal,window,document,navigator}=globalThis.__frame;' +
      fs.readFileSync('dist/user/framing.js', 'utf8').replace(/^import[^;]+;\r?\n/gm, ''),
  );
  framing.openFraming({ standDescription: '步道内', bearing: 90, heightMeters: 1.5 });
  assert.equal(requests, 0, 'Opening guide must not request camera');
  const start = controls['#framing-start'].onclick({ target: controls['#framing-start'] });
  assert.equal(requests, 1);
  d.open = false;
  cleanup();
  pending({
    getTracks: () => [
      {
        stop() {
          stops++;
        },
      },
    ],
  });
  await start;
  assert.equal(stops, 1, 'Late permission response cannot keep a camera active after close');
  const storage = new Map(),
    files = new Set();
  let origin = 'https://one.example',
    copy;
  const wx = {
    env: { USER_DATA_PATH: '/sandbox' },
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getFileSystemManager: () => ({
      mkdirSync() {},
      copyFile: (options) => {
        copy = options;
      },
      accessSync(p) {
        assert(files.has(p));
      },
      unlink(o) {
        files.delete(o.filePath);
      },
    }),
  };
  const module = { exports: {} };
  vm.runInNewContext(
    '(function(require,module,wx){' +
      fs.readFileSync('miniprogram/services/checkin-draft.js', 'utf8') +
      '\n})',
  )(() => ({ configuredOrigin: () => origin }), module, wx);
  const draft = module.exports;
  storage.set('explore-mini-session-v1', { origin, account: { id: 'alice' } });
  const saving = draft.save('alice', 'nmu1', id, {
    photo: '/temporary.jpg',
    note: 'private draft',
  });
  files.add(copy.destPath);
  copy.success();
  await saving;
  assert.equal(draft.load('alice', 'nmu1', id).note, 'private draft');
  assert.equal(draft.load('bob', 'nmu1', id), null);
  origin = 'https://two.example';
  assert.equal(draft.load('alice', 'nmu1', id), null);
  origin = 'https://one.example';
  const late = draft.save('alice', 'nmu1', id, { photo: '/another.jpg', note: 'late' });
  draft.clear();
  storage.delete('explore-mini-session-v1');
  files.add(copy.destPath);
  copy.success();
  await late;
  assert.equal(files.size, 0, 'Logout clears private draft files, including in-flight copies');
  delete global.__frame;
  console.log(
    'PASS v7: public-only bounded offline snapshots, expiry/removal; opt-in camera and late cleanup; account/origin-scoped persistent drafts and logout race.',
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
