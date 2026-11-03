const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
(async () => {
  let resizeHandler;
  const viewportModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/viewport.js', 'utf8'), {
    module: viewportModule,
    wx: {
      getWindowInfo: () => ({ windowWidth: 768, windowHeight: 960, pixelRatio: 2 }),
      onWindowResize: (handler) => {
        resizeHandler = handler;
      },
    },
  });
  const viewport = viewportModule.exports;
  assert.equal(viewport.snapshot().windowWidth, 768);
  resizeHandler({ size: { windowWidth: 1024, windowHeight: 704 } });
  assert.equal(viewport.snapshot().windowWidth, 1024, 'real resize replaces cached portrait width');
  assert.equal(viewport.snapshot().windowHeight, 704);
  assert.equal(viewport.snapshot().pixelRatio, 2);
  resizeHandler({ size: { windowWidth: 0, windowHeight: 0 } });
  assert.equal(viewport.snapshot().windowWidth, 1024, 'invalid resize cannot collapse the scene');
  const store = new Map(),
    app = {
      globalData: {
        account: { id: 'alice' },
        unread: 8,
        pendingPassportRewards: { owner: 'alice' },
      },
    };
  let requests = [],
    cleared = 0,
    reset = 0;
  const pages = [
    {
      route: 'pages/my/index',
      resetAccountView821() {
        reset++;
      },
    },
    {
      route: 'pages/admin-console/index',
      resetAccountView821() {
        throw Error('user logout touched admin');
      },
    },
  ];
  const modules = {
    './network': {
      backendOrigin: () => 'https://qa.invalid',
      configuredOrigin: () => 'https://qa.invalid',
    },
    './public-offline': { put() {}, remove() {}, get: () => null },
    './request-cache': { clear() {}, read() {} },
    './checkin-draft': {
      clear() {
        cleared++;
      },
    },
  };
  const wx = {
    getStorageSync: (k) => store.get(k),
    removeStorageSync: (k) => store.delete(k),
    setStorageSync: (k, v) => store.set(k, v),
    request: (r) => requests.push(r),
  };
  const context = {
    module: { exports: {} },
    require: (p) => {
      if (!(p in modules)) throw Error('Missing ' + p);
      return modules[p];
    },
    wx,
    getApp: () => app,
    getCurrentPages: () => pages,
    console,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/api.js', 'utf8'), context);
  const api = context.module.exports;
  api.saveSession({
    token: 'a'.repeat(64),
    expiresAt: Date.now() + 60000,
    account: { id: 'alice' },
  });
  const pending = api.request('/api/my/library');
  const rejected = assert.rejects(pending, /账号已改变/);
  const before = reset;
  api.clearSession();
  assert.equal(reset, before + 1, 'logout clears retained user pages immediately');
  assert.equal(app.globalData.account, null);
  assert.equal(app.globalData.unread, 0);
  assert.equal(app.globalData.pendingPassportRewards, null);
  assert.equal(cleared, 1, 'explicit logout clears drafts');
  requests[0].success({ statusCode: 200, data: { private: 'old account' } });
  await rejected;
  api.updateAccount({ id: 'alice' });
  assert.equal(app.globalData.account, null, 'late profile cannot revive logout');
  api.saveSession({ token: 'b'.repeat(64), expiresAt: Date.now() + 60000, account: { id: 'bob' } });
  api.updateAccount({ id: 'alice' });
  assert.equal(api.session().account.id, 'bob', 'late profile cannot replace next account');
  const expired = api.request('/api/my/library');
  const expireRejected = assert.rejects(expired, /登录已过期/);
  requests.at(-1).success({ statusCode: 401, data: {} });
  await expireRejected;
  assert.equal(cleared, 1, 'expiry retains scoped draft');
  // Actual page reset clears all personal surfaces, bumps request serials and leaves public layout/theme intact.
  const out = { exports: {} },
    bar = {
      setData(p) {
        this.data = p;
      },
    },
    header = {
      refreshAccount821() {
        this.cleared = true;
      },
    };
  const pageMods = {
    './features': { snapshot: () => ({}), methods: {} },
    './appearance': { snapshot: () => ({ themeStyle: 'kept' }) },
    './share-brand': { install() {} },
    './localization': { page: (d) => d },
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/page.js', 'utf8'), {
    module: out,
    require: (p) => pageMods[p],
    getApp: () => app,
    clearTimeout,
    setTimeout,
  });
  const d = out.exports.pageOptions({
    data: { account: null, records: [], summary: {}, contentTab: 'saved', contentRows: [] },
  });
  const page = {
    ...d,
    data: {
      ...d.data,
      account: { id: 'alice' },
      records: [{ photo: 'private' }],
      summary: { unique: 3 },
      nativeRewardItems812: [{}],
    },
    serial: 4,
    setData(p) {
      Object.assign(this.data, p);
    },
    getTabBar: () => bar,
    selectComponent: (id) => (id === '#community-header' ? header : null),
  };
  page.resetAccountView821();
  assert.equal(page.data.records.length, 0);
  assert.equal(page.data.account, null);
  assert.equal(page.data.summary.unique, undefined);
  assert.equal(page.data.themeStyle, 'kept');
  assert.equal(page.serial, 5);
  assert.equal(header.cleared, true);
  // Returning from administration changes the route without clearing either session.
  let returnDefinition,
    navigations = [],
    promptCount = 0,
    confirmLeave = false;
  vm.runInNewContext(fs.readFileSync('miniprogram/components/admin-user-return/index.js', 'utf8'), {
    Component: (d) => {
      returnDefinition = d;
    },
    wx: {
      switchTab: (options) => navigations.push(options.url),
      showModal: (options) => {
        promptCount++;
        options.success({ confirm: confirmLeave });
      },
    },
  });
  const returnControl = { data: { busy: true, dirty: false, locale: 'zh-CN' } };
  await returnDefinition.methods.openUser.call(returnControl);
  assert.equal(navigations.length, 0, 'saving must not be interrupted');
  returnControl.data.busy = false;
  returnControl.data.dirty = true;
  await returnDefinition.methods.openUser.call(returnControl);
  assert.equal(navigations.length, 0, 'cancel keeps the unfinished edit');
  confirmLeave = true;
  await returnDefinition.methods.openUser.call(returnControl);
  assert.equal(promptCount, 2);
  assert.equal(navigations[0], '/pages/discover/index');
  returnControl.data.dirty = false;
  await returnDefinition.methods.openUser.call(returnControl);
  assert.equal(promptCount, 2, 'saved pages return directly');
  // A rotation repositions the real tour target, not its shortened display text.
  let experienceDefinition;
  vm.runInNewContext(fs.readFileSync('miniprogram/components/experience-layer/index.js', 'utf8'), {
    Component: (d) => {
      experienceDefinition = d;
    },
    require: (p) =>
      p.endsWith('/viewport')
        ? viewport
        : p.endsWith('/localization')
          ? { component: (d) => d }
          : p.endsWith('/features')
            ? { visible: () => true }
            : {},
    clearTimeout,
  });
  const tourCalls = [],
    step = ['shots', '.search', 'camera', '找到想拍的那一站', '搜索与筛选'];
  const guide = {
    visible: true,
    data: {},
    fitChat() {},
    setData(p) {
      Object.assign(this.data, p);
    },
    locateFeatureTour821: (...args) => tourCalls.push(args),
  };
  experienceDefinition.methods.showFeatureTour821.call(guide, step, 1, 8);
  experienceDefinition.pageLifetimes.resize.call(guide);
  assert.equal(tourCalls[1][0], step);
  assert.equal(tourCalls[1][1], 1);
  guide.visible = false;
  experienceDefinition.pageLifetimes.resize.call(guide);
  assert.equal(tourCalls.length, 2, 'hidden tour does not reappear on rotation');
  // A hidden page must never publish a late canvas bitmap over the next page.
  let collectionDefinition,
    imageLoads = [],
    exports = [],
    cinemaFrames = [];
  const atlas = {
    photoURL: '/campus.jpg',
    buildings: [{ id: 'one', frame: 'photo', pointIds: [], collected: true, outline: [] }],
  };
  const collectionApi = {
    session: () => ({ account: { id: 'alice' } }),
    request: async () => ({ atlas }),
    asset: (p) => p,
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/components/campus-collection/index.js', 'utf8'), {
    Component: (d) => {
      collectionDefinition = d;
    },
    require: (p) =>
      ({
        '../../services/api': collectionApi,
        '../../services/viewport': {
          snapshot: () => ({ pixelRatio: 1, windowWidth: 1024, windowHeight: 768 }),
          update() {},
        },
        '../../services/atlas': { draw: () => 80 },
        '../../services/collection-cinema': {
          duration: 3000,
          impactAt: 1800,
          render: (...args) => {
            cinemaFrames.push(args);
            return { layout: { map: { y: 100, height: 200 } } };
          },
        },
        '../../services/network': { configuredOrigin: () => 'https://qa.invalid' },
        '../../services/features': { enabled: () => true },
        '../../services/localization': { component: (d) => d },
      })[p],
    wx: {
      nextTick: (fn) => fn(),
      getWindowInfo: () => ({ pixelRatio: 1, windowWidth: 1024, windowHeight: 768 }),
      canvasToTempFilePath: (o) => exports.push(o),
    },
  });
  const canvas = {
    createImage: () => {
      const image = {};
      imageLoads.push(image);
      return image;
    },
    cancelAnimationFrame() {},
  };
  const collection = {
    ...collectionDefinition.methods,
    data: { ...collectionDefinition.data, revealed: [] },
    mounted: true,
    visible: true,
    setData(p) {
      Object.assign(this.data, p);
    },
    createSelectorQuery() {
      return {
        select() {
          return this;
        },
        fields() {
          return this;
        },
        exec(fn) {
          fn([{ node: canvas, width: 100 }]);
        },
      };
    },
  };
  await collection.load();
  imageLoads[0].onload();
  assert.equal(exports.length, 1);
  collectionDefinition.pageLifetimes.hide.call(collection);
  exports[0].success({ tempFilePath: 'old-page.png' });
  assert.equal(collection.data.thumbnail, '');
  assert.equal(collection.data.active, false);
  collection.visible = true;
  collection.data.active = true;
  await collection.load();
  imageLoads[1].onload();
  exports[1].success({ tempFilePath: 'current.png' });
  assert.equal(collection.data.thumbnail, 'current.png');
  await collection.load();
  assert.equal(
    imageLoads.length,
    2,
    'unchanged progress reuses bitmap instead of retaining a live canvas',
  );
  const resizeEvents = [],
    oldImage = {};
  Object.assign(collection, {
    cinemaImage814: oldImage,
    cinemaAtlas814: atlas,
    cinemaAlive814: () => true,
    landingStartedAt: Date.now() - 5000,
    triggerEvent: (name, detail) => resizeEvents.push({ name, detail }),
  });
  collection.resizeCinema821();
  assert.equal(cinemaFrames[0][1], oldImage, 'tablet rotation reuses decoded image');
  assert.equal(cinemaFrames[0][7], 3000, 'completed animation stays complete after rotation');
  assert.equal(collection.data.stageHeight, 768);
  assert.equal(resizeEvents.length, 1);
  assert.equal(resizeEvents[0].name, 'phase', 'rotation does not trigger another impact');
  assert.equal(resizeEvents[0].detail.landed, true);
  const rootStyle = fs
    .readFileSync('miniprogram/app.wxss', 'utf8')
    .match(/page\s*\{([\s\S]*?)\}/)[1];
  assert(
    !/gradient|background-image/.test(rootStyle),
    'old page gradient must not flash between routes',
  );
  // iPad landscape stays usable, including Safari's desktop UA; phone landscape and desktop gates remain.
  function viewport821({
    width,
    height,
    screenWidth = width,
    screenHeight = height,
    coarse = false,
    points = 0,
    platform = 'Win32',
    ua = '',
    orientation = 'landscape-primary',
  }) {
    let blocked;
    const classes = {
      toggle: (name, value) => {
        if (name === 'viewport-blocked') blocked = value;
      },
    };
    const gate = {
      hidden: true,
      open: false,
      setAttribute() {},
      addEventListener() {},
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      querySelector() {
        return null;
      },
    };
    vm.runInNewContext(fs.readFileSync('dist/user/mobile-viewport.js', 'utf8'), {
      innerWidth: width,
      innerHeight: height,
      navigator: { maxTouchPoints: points, platform, userAgent: ua },
      screen: {
        width: screenWidth,
        height: screenHeight,
        orientation: { type: orientation, addEventListener() {} },
      },
      matchMedia: () => ({ matches: coarse }),
      location: { hash: '#discover' },
      sessionStorage: { getItem: () => null },
      CustomEvent: function () {},
      document: {
        body: { children: [], append() {} },
        documentElement: { classList: classes },
        getElementById: () => gate,
        querySelectorAll: () => [],
      },
      window: { addEventListener() {}, dispatchEvent() {} },
    });
    return blocked;
  }
  assert.equal(
    viewport821({ width: 1024, height: 768, points: 5, platform: 'MacIntel', ua: 'Macintosh' }),
    false,
  );
  assert.equal(
    viewport821({
      width: 768,
      height: 1024,
      coarse: true,
      points: 5,
      ua: 'iPad',
      orientation: 'portrait-primary',
    }),
    false,
  );
  assert.equal(
    viewport821({ width: 852, height: 393, coarse: true, points: 5, ua: 'iPhone' }),
    true,
  );
  assert.equal(viewport821({ width: 1280, height: 900 }), true);
  assert.match(fs.readFileSync('miniprogram/app.wxss', 'utf8'), /--jy-rpx:\s*0\.573333px/);
  assert.equal(JSON.parse(fs.readFileSync('miniprogram/app.json')).resizable, true);
  // Native icon references introduced by this fix must resolve in both themes.
  for (const name of [
    'edit',
    'trash',
    'heart',
    'share',
    'pin',
    'camera',
    'checklist',
    'campus-map',
    'building',
    'panorama',
    'navigation',
    'walk',
    'bell',
  ])
    for (const suffix of ['', '-dark'])
      assert(
        fs.existsSync('miniprogram/assets/jingyu-icons/' + name + suffix + '.png'),
        name + suffix,
      );
  console.log(
    'PASS v8.2.1: immediate logout/expiry reset, late response and profile isolation, private surface clearing, separate admin and real light/dark icon assets.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
