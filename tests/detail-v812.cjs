const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  acorn = require('acorn');
const family = JSON.parse(fs.readFileSync('dist/shared/jingyu-icons/catalogue.json'));
const geometry = JSON.parse(fs.readFileSync('tools/jingyu-line-geometry.json'));
assert.equal(
  new Set(Object.values(geometry).map(JSON.stringify)).size,
  family.icons.length,
  'Different functional names must not silently reuse one generic drawing',
);
for (const name of family.icons) {
  const svg = fs.readFileSync('dist/shared/jingyu-icons/' + name + '.svg', 'utf8');
  assert(svg.includes('stroke-linecap="round"') && svg.includes('stroke-linejoin="round"'));
  assert(svg.includes('fill="none"') && svg.includes('stroke-width="1.7"'));
}
const moduleIcon = { exports: {} };
vm.runInNewContext(fs.readFileSync('miniprogram/services/icon-path.wxs', 'utf8'), {
  module: moduleIcon,
});
for (const name of family.icons)
  for (const dark of [false, true]) {
    const suffix = dark ? '-dark' : '';
    const web = fs.readFileSync(`dist/shared/jingyu-icons/${name}${suffix}.png`),
      native = fs.readFileSync(`miniprogram/assets/jingyu-icons/${name}${suffix}.png`);
    assert.equal(web.subarray(1, 4).toString(), 'PNG');
    assert.equal(native.subarray(1, 4).toString(), 'PNG');
    assert.equal(native.readUInt32BE(16), 48);
    assert.equal(native.readUInt32BE(20), 48);
    assert.equal(moduleIcon.exports.path(name, dark), `/assets/jingyu-icons/${name}${suffix}.png`);
    if (dark)
      assert.notDeepEqual(native, fs.readFileSync(`miniprogram/assets/jingyu-icons/${name}.png`));
  }
for (const [name, art] of Object.entries(family.aliases))
  assert.equal(moduleIcon.exports.path(name, false), `/assets/jingyu-icons/${art}.png`);
const share = require('../miniprogram/services/share-brand');
assert.equal(
  share.card({ route: 'pages/my/index', data: { point: { name: 'PRIVATE' } } }).title,
  '景遇 JINGYU · 在校园，遇见更多美好',
);
assert.equal(
  share.card(
    { route: 'pages/contact/index' },
    { path: '/pages/contact/index?id=private&body=PRIVATE' },
  ).path,
  '/pages/discover/index',
);
const card = share.card(
  { route: 'pages/detail/index', id: 'nmu1', data: { point: { name: '图书馆' } } },
  { path: '/pages/detail/index?id=nmu1&token=SECRET&body=PRIVATE' },
);
assert.equal(card.path, '/pages/detail/index?id=nmu1');
assert.equal(card.title, '景遇 JINGYU · 图书馆');
assert(fs.existsSync('miniprogram' + card.imageUrl));
assert.equal(
  share.card({ route: 'pages/topic/index', topicId: 'autumn' }).path,
  '/pages/topic/index?id=autumn',
);
const def = {
  onShareAppMessage() {
    return { path: '/pages/plan-share/index?id=explicit-public-grant', title: '周末路线' };
  },
};
share.install(def);
assert.equal(
  def.onShareAppMessage.call({ route: 'pages/plans/index' }).path,
  '/pages/plan-share/index?id=explicit-public-grant',
);
// Reproduce the lexical cause of the reported map error: setupMap must not shadow its status callback.
const ast = acorn.parse(fs.readFileSync('dist/user/pages/map.js', 'utf8'), {
  ecmaVersion: 'latest',
  sourceType: 'module',
});
function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const value of Object.values(node))
    if (Array.isArray(value)) value.forEach((v) => visit(v, fn));
    else if (value && typeof value === 'object') visit(value, fn);
}
let setup;
visit(ast, (n) => {
  if (n.type === 'FunctionDeclaration' && n.id?.name === 'setupMap') setup = n;
});
assert(setup);
visit(setup, (n) => {
  if (n.type === 'VariableDeclarator') assert.notEqual(n.id.name, 'status');
});
const webSettings = fs.readFileSync('dist/user/settings.js', 'utf8'),
  miniSettings = fs.readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
assert(!webSettings.includes('name="motion"'));
assert(!miniSettings.includes('data-key="motion"'));
assert(!fs.readFileSync('dist/admin/dock.css', 'utf8').includes('position: fixed; top: 0;'));
console.log(
  'PASS v8.1.2: 80 original line icon identities with real light/dark assets, native sizes and aliases, branded public share destinations/privacy, map callback scope and retired app motion controls.',
);

// A committed server delta is consumed once, kept behind its owner's scope, and restores the Dock.
(async () => {
  const globalData = {};
  const session = { account: { id: 'owner-a' } };
  const bar = {
    data: {},
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  const modules = {
    './features': {
      snapshot: () => ({}),
      load: async () => ({}),
      forPage: () => null,
      allow: () => true,
      methods: {},
    },
    './appearance': { snapshot: () => ({}), account() {}, subscribe: () => () => {} },
    './network': { configuredOrigin: () => 'https://test.invalid' },
    './api': { session: () => session, asset: (p) => p },
    './public-content': { show() {}, hide() {} },
    './assistant-route-guide': { consume() {} },
    './share-brand': { publicPages: new Set(), install() {} },
    './localization': { page: (d) => d },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/page.js', 'utf8'), {
    module,
    require: (name) => modules[name],
    getApp: () => ({ globalData }),
    getCurrentPages: () => [],
    wx: { showShareMenu() {}, nextTick: (f) => f() },
    setTimeout,
    clearTimeout,
  });
  const d = module.exports.pageOptions({ data: {} });
  const page = {
    ...d,
    data: { ...d.data },
    route: 'pages/my/index',
    getTabBar: () => bar,
    setData(p) {
      Object.assign(this.data, p);
    },
  };
  const events = { atlas: { buildings: [] }, buildings: [{ id: 'photo:1', title: '教学楼' }] };
  globalData.pendingPassportRewards = { owner: 'owner-a', origin: 'https://test.invalid', events };
  await page.onShow();
  assert.equal(page.data.nativeRewardItems812[0].atlas, events.atlas);
  assert.equal(globalData.pendingPassportRewards, null);
  assert.equal(bar.data.pageOverlayOpen, true);
  page.dismissNativeRewards812();
  assert.equal(bar.data.pageOverlayOpen, false);
  await page.onShow();
  assert.equal(page.data.nativeRewardItems812.length, 0);
  globalData.pendingPassportRewards = {
    owner: 'someone-else',
    origin: 'https://test.invalid',
    events,
  };
  await page.onShow();
  assert.equal(page.data.nativeRewardItems812.length, 0);
  console.log(
    'PASS native committed atlas delta: once-only delivery, owner isolation, dismissal and Dock restoration.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
