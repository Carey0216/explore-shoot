const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve('miniprogram');

function runtime(overrides = {}, extraWx = {}) {
  const storage = new Map(),
    timers = new Map(),
    modules = new Map();
  let definition,
    timer = 0,
    theme;
  const wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    getAppBaseInfo: () => ({ theme: 'light' }),
    onThemeChange: (fn) => (theme = fn),
    pageScrollTo() {},
    nextTick: (fn) => fn(),
    ...extraWx,
  };
  function load(relative) {
    const file = path.resolve(root, relative);
    if (overrides[file]) return overrides[file];
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    vm.runInNewContext(
      '(function(require,module,exports,wx,Page,Component){' +
        fs.readFileSync(file, 'utf8') +
        '\n})',
      {
        setTimeout: (fn) => {
          timers.set(++timer, fn);
          return timer;
        },
        clearTimeout: (id) => timers.delete(id),
        setInterval: (fn) => {
          timers.set(++timer, fn);
          return timer;
        },
        clearInterval: (id) => timers.delete(id),
      },
      { filename: file },
    )(
      (name) => load(path.relative(root, path.resolve(path.dirname(file), name + '.js'))),
      module,
      module.exports,
      wx,
      (d) => (definition = d),
      (d) => (definition = d),
    );
    return module.exports;
  }
  function instance(d, props = {}) {
    const host = {
      data: JSON.parse(JSON.stringify({ ...d.data, ...props })),
      nativeVisible: true,
      setData(values, callback) {
        for (const [key, v] of Object.entries(values)) {
          const parts = key.split('.');
          let o = this.data;
          while (parts.length > 1) {
            const k = parts.shift();
            o = o[k] ??= /^\d+$/.test(parts[0]) ? [] : {};
          }
          o[parts[0]] = v;
        }
        callback?.();
      },
    };
    for (const [key, value] of Object.entries(d.methods || d))
      if (typeof value === 'function') host[key] = value.bind(host);
    return host;
  }
  return {
    load,
    instance,
    storage,
    timers,
    wx,
    definition: () => definition,
    theme: (e) => theme(e),
  };
}
const stub = (name, value) => [path.join(root, name), value];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

(async () => {
  const calls = [];
  const quiz = runtime(
    Object.fromEntries([
      stub('services/page.js', { pageOptions: (d) => d }),
      stub('services/api.js', { request: (...args) => calls.push(args) }),
    ]),
  );
  quiz.load('pages/scout/index.js');
  const scout = quiz.instance(quiz.definition());
  scout.setData({
    paper: {
      id: 'paper',
      questions: Array.from({ length: 5 }, (_, i) => ({
        id: 'q' + i,
        options: ['甲', '乙', '丙', '丁'],
      })),
    },
  });
  scout.draw();
  scout.answer({ detail: { value: '2' } });
  assert.equal(scout.data.step, 0);
  assert.equal(quiz.timers.size, 1);
  assert.equal(scout.data.complete, false);
  [...quiz.timers.values()][0]();
  quiz.timers.clear();
  assert.equal(scout.data.step, 1);
  scout.answer({ detail: { value: '0' } });
  scout.previous();
  assert.equal(quiz.timers.size, 0, 'Previous cancels delayed automatic advance');
  assert.equal(scout.data.step, 0);
  assert.equal(scout.data.choices[2].checked, true);
  for (let i = 1; i < 5; i++) {
    scout.setData({ step: i });
    scout.draw();
    scout.answer({ detail: { value: String(i % 4) } });
    quiz.timers.clear();
  }
  assert.equal(scout.data.complete, true);
  assert.equal(scout.data.step, 4);
  assert.equal(calls.length, 0, 'Selections do not submit or reveal per-question correctness');
  assert(!Object.hasOwn(scout.data, 'correct'));

  const pending = [],
    pins = [],
    releases = [];
  const images = runtime(
    Object.fromEntries([
      stub('services/api.js', {
        download: (source, thumb) => {
          const d = deferred();
          pending.push({ source, thumb, ...d });
          return d.promise;
        },
        retainFile: (p) => pins.push(p),
        releaseFile: (p) => releases.push(p),
        asset: (p) => p,
      }),
      stub('services/admin-api.js', {
        download: () => {
          throw Error('Public assets must not use administrator-only media routing');
        },
      }),
    ]),
  );
  images.load('components/remote-image/index.js');
  const image = images.instance(images.definition(), { source: '/media/a', full: false });
  image.ready = true;
  image.createIntersectionObserver = () => ({
    relativeToViewport() {
      return this;
    },
    observe(_, fn) {
      fn({ intersectionRatio: 1 });
    },
    disconnect() {},
  });
  // Observer notifications are asynchronous in the platform.
  const observed = [];
  image.createIntersectionObserver = () => ({
    relativeToViewport() {
      return this;
    },
    observe(_, fn) {
      observed.push(fn);
    },
    disconnect() {},
  });
  image.load();
  observed.shift()({ intersectionRatio: 1 });
  pending[0].reject(Error('thumb decode'));
  await tick();
  assert.equal(pending[1].thumb, false);
  image.setData({ source: '/media/b' });
  image.load();
  observed.shift()({ intersectionRatio: 1 });
  pending[1].resolve('wxfile://late-a');
  await tick();
  assert.notEqual(image.data.src, 'wxfile://late-a');
  pending[2].resolve('wxfile://b');
  await tick();
  assert.equal(image.data.src, 'wxfile://b');
  assert(pins.includes('wxfile://b'));
  image.setData({ source: '/shared/reference.jpg', administrator: true });
  image.load();
  image.error();
  assert.equal(pending.at(-1).source, '/shared/reference.jpg');
  pending.at(-1).resolve('wxfile://reference');
  await tick();
  assert.equal(image.data.src, 'wxfile://reference');

  let identity = 'user-a',
    write,
    shared = 0;
  const exportFiles = [],
    deleted = [];
  const notes = runtime(
    Object.fromEntries([
      stub('services/page.js', { pageOptions: (d) => d }),
      stub('services/api.js', {
        identity: () => identity,
        request: async () => '<html>private</html>',
        registerFile: (p) => exportFiles.push(p),
        forgetFile: (p) => deleted.push(p),
      }),
    ]),
    {
      env: { USER_DATA_PATH: 'wxfile://private' },
      getFileSystemManager: () => ({ writeFile: (o) => (write = o) }),
      shareFileMessage: () => shared++,
    },
  );
  notes.load('pages/notes/index.js');
  const note = notes.instance(notes.definition());
  note.id = 'record';
  const exporting = note.exportNote();
  await tick();
  assert.equal(exportFiles.length, 1);
  identity = 'user-b';
  write.success();
  await exporting;
  assert.equal(shared, 0, 'Changing account while export writes must not open a private file');
  assert.equal(deleted[0], exportFiles[0]);

  const appearance = runtime(
    Object.fromEntries([
      stub('services/network.js', { configuredOrigin: () => 'https://fixture.example' }),
      stub('services/api.js', { session: () => null }),
      stub('services/admin-api.js', { session: () => null }),
    ]),
  );
  const theme = appearance.load('services/appearance.js');
  theme.install();
  theme.account({ id: 'same-id' });
  await theme.update({ appearance: 'dark' });
  assert.equal(theme.snapshot().themeDark, true);
  appearance.theme({ theme: 'light' });
  assert.equal(theme.snapshot().themeDark, true, 'Manual preference wins over the OS');
  theme.account({ id: 'same-id' }, true);
  assert.equal(
    theme.snapshot().appearance,
    'system',
    'Administrator preference is separate from user with the same ID',
  );
  appearance.theme({ theme: 'dark' });
  assert.equal(theme.snapshot().themeDark, true);
  theme.account({ id: 'same-id' });
  assert.equal(theme.snapshot().appearance, 'dark');
  await theme.update({ motion: 'reduce' });
  assert.equal(theme.snapshot().themeClass, 'theme-dark');
  assert.equal(theme.snapshot().reducedMotion, undefined);
  assert.equal(Object.hasOwn(theme.snapshot().preferences, 'motion'), false);
  assert.equal(theme.snapshot().themeDark, true);
  const lifecycle = runtime(
    Object.fromEntries([
      stub('services/page.js', { pageOptions: (d) => d }),
      stub('services/api.js', {}),
    ]),
  );
  lifecycle.load('scenes/campus/index.js');
  const scenePage = lifecycle.instance(lifecycle.definition());
  let sceneLoads = 0;
  scenePage.load = () => {
    sceneLoads++;
    scenePage.started = true;
    scenePage.setData({ loading: true });
  };
  scenePage.onReady();
  scenePage.onShow();
  assert.equal(sceneLoads, 1, 'Initial show and ready must not create two WebGL contexts');
  scenePage.onHide();
  assert.equal(scenePage.data.canvasVisible, false);
  scenePage.onShow();
  assert.equal(sceneLoads, 2, 'Returning after hide creates one fresh canvas');
  const { placementModel } = require('../miniprogram/services/map-placement');
  const scene = {
    origin: [106.1, 38.4968],
    models: [
      {
        id: 'clock',
        height: 80,
        extent: [86, 80, 60],
        meshAsset: { url: '/shared/campus-assets/models/clock.glb' },
      },
    ],
  };
  const metreEast = 1 / (111320 * Math.cos((38.4968 * Math.PI) / 180));
  const placed = placementModel(scene, {
    lng: 106.1 + metreEast,
    lat: 38.4968 - 1 / 111320,
    heading: 90,
    scale: 0.7,
    altitude: 5,
  });
  assert(Math.abs(placed.position[0] - 1) < 1e-6 && Math.abs(placed.position[2] - 1) < 1e-6);
  assert.equal(placed.position[1], 5);
  assert.equal(placed.height, 56);
  assert.equal(placed.meshAsset.rotation, -Math.PI / 2);
  assert.throws(() =>
    placementModel(scene, { lng: 106, lat: 38, heading: 0, scale: 0, altitude: 0 }),
  );
  const atlasRuntime = runtime(
    Object.fromEntries([
      stub('services/page.js', { pageOptions: (d) => d }),
      stub('services/admin-api.js', {
        session: () => ({ account: { id: 'fixture-owner', role: 'owner' } }),
      }),
      stub('services/api.js', {}),
    ]),
  );
  atlasRuntime.load('scenes/atlas-editor/index.js');
  const editorPage = atlasRuntime.instance(atlasRuntime.definition());
  editorPage.onLoad({ id: 'photo%3Awest-01' });
  assert.equal(editorPage.id, 'photo:west-01');
  editorPage.shape = {
    outline: [
      [1, 1],
      [20, 1],
      [20, 20],
      [1, 20],
    ],
    holes: [],
  };
  editorPage.history = [];
  editorPage.active = 0;
  editorPage.paint = () => {};
  const command = (action) => editorPage.command({ currentTarget: { dataset: { action } } });
  command('redraw');
  assert.equal(editorPage.data.mode, 'draw');
  assert.equal(editorPage.shape.outline.length, 0);
  command('undo');
  assert.equal(editorPage.data.mode, 'pan', 'Undo restores the tool mode as well as the polygon');
  assert.equal(editorPage.shape.outline.length, 4);
  editorPage.owner = 'fixture-owner';
  editorPage.image = null;
  let reloads = 0;
  editorPage.load = () => reloads++;
  editorPage.onShow();
  assert.equal(
    reloads,
    1,
    'Returning during an interrupted bottom-image load retries instead of staying stuck',
  );
  const geometry = require('../miniprogram/services/atlas-geometry');
  const atlas = {
    photoWidth: 1000,
    photoHeight: 600,
    planWidth: 1280,
    planHeight: 854,
    buildings: [
      {
        id: 'photo:a',
        frame: 'photo',
        outline: [
          [100, 100],
          [200, 100],
          [200, 200],
          [100, 200],
        ],
        holes: [
          [
            [125, 125],
            [150, 125],
            [150, 150],
            [125, 150],
          ],
        ],
      },
    ],
  };
  for (const frame of ['photo', 'plan']) {
    const point = [177, 230];
    assert.deepEqual(geometry.source(geometry.display(point, atlas, frame), atlas, frame), point);
  }
  assert.equal(
    geometry.hit(atlas, 'photo', (110 * 300) / 600, (890 * 300) / 600, 300).id,
    'photo:a',
  );
  assert.equal(
    geometry.hit(atlas, 'photo', (140 * 300) / 600, (860 * 300) / 600, 300),
    undefined,
    'Courtyard is not a building hit',
  );
  let saved = 0,
    lastRequest;
  const onboarding = runtime(
    Object.fromEntries([
      stub('services/page.js', { pageOptions: (d) => d }),
      stub('services/api.js', {
        request: async (path, method, body) => {
          lastRequest = { path, method, body };
          return { onboardingRequired: true, ticket: 'opaque-onboarding-ticket' };
        },
        saveSession: () => saved++,
      }),
    ]),
    { login: (options) => options.success({ code: 'ephemeral-code' }) },
  );
  onboarding.load('pages/login/index.js');
  const loginPage = onboarding.instance(onboarding.definition());
  loginPage.wechat();
  await tick();
  assert.equal(loginPage.data.onboarding, true);
  assert.equal(saved, 0, 'An unbound identity is not a logged-in account');
  assert.equal(loginPage.data.ticket, undefined, 'Ticket never enters rendered page data');
  loginPage.chooseAccount({ currentTarget: { dataset: { action: 'create' } } });
  loginPage.setData({ username: 'campus_user', password: 'GoodPass2026', confirm: 'wrong' });
  await loginPage.submit();
  assert.match(loginPage.data.error, /不一致/);
  assert.equal(lastRequest.path, '/api/mini/wechat/login');
  loginPage.cancelWechat();
  assert.equal(loginPage.wechatTicket, null);
  assert.equal(loginPage.data.password, '');
  let routeIdentity = 'account-one',
    routeRevision = 1,
    routeRequests = 0,
    pendingRoute;
  const routing = runtime(
    Object.fromEntries([
      stub('services/api.js', {
        identity: () => routeIdentity,
        cached: async () => ({ provider: 'amap', revision: routeRevision, configured: true }),
        request: async (endpoint, method, body) => {
          routeRequests++;
          assert.equal(endpoint, '/api/maps/walking');
          assert.equal(method, 'POST');
          assert.deepEqual(Object.keys(body).sort(), ['start', 'target']);
          if (pendingRoute) return pendingRoute.promise;
          return {
            available: true,
            provider: 'amap',
            coordinateSystem: 'GCJ02',
            path: [
              [106.1, 38.5],
              [106.1002, 38.5001],
            ],
            length: 120,
            duration: 2,
            steps: [],
          };
        },
      }),
    ]),
  );
  const walking = routing.load('services/walking.js'),
    start = { lng: 106.095, lat: 38.499 },
    target = { lng: 106.096, lat: 38.4995 };
  const firstRoute = await walking.miniWalking(null, 'must-not-send', start, target);
  assert.equal(firstRoute.available, true);
  assert.equal(firstRoute.provider, 'amap');
  assert.notEqual(firstRoute.path[0][0], 106.1, 'Vendor GCJ02 is converted back to internal WGS84');
  await walking.miniWalking(null, 'must-not-send', start, target);
  assert.equal(routeRequests, 1);
  routeRevision++;
  await walking.miniWalking(null, '', start, target);
  assert.equal(routeRequests, 2, 'Changing service revision invalidates old routes');
  routeRevision++;
  pendingRoute = deferred();
  const staleRoute = walking.miniWalking(null, '', start, target);
  await tick();
  routeIdentity = 'account-two';
  pendingRoute.resolve({
    available: true,
    coordinateSystem: 'GCJ02',
    path: [
      [106.1, 38.5],
      [106.1002, 38.5001],
    ],
  });
  assert.equal(
    (await staleRoute).available,
    false,
    'An old account route cannot repaint the new account',
  );
  console.log(
    'Native sequential quiz, thumbnail fallback races, public admin images and scoped system appearance passed.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
