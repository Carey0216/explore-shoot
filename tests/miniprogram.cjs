const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const root = path.resolve('miniprogram');
const files = fs.readdirSync(root, { recursive: true });
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
const storage = new Map();
const requests = [];
const downloads = [];
const removed = [];
let pageDefinition, componentDefinition;
const application = { globalData: {} };
const clientConfig = { apiBase: 'https://campus.example.test', development: false };
let devicePlatform = 'devtools';
const wx = {
  getDeviceInfo: () => ({ platform: devicePlatform }),
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  request: (options) => requests.push(options),
  downloadFile: (options) => downloads.push(options),
  getFileSystemManager: () => ({ unlink: (options) => removed.push(options.filePath) }),
  setNavigationBarTitle() {},
  setTabBarItem() {},
  navigateTo() {},
  showToast() {},
};
const cache = new Map();
function load(file) {
  const resolved = path.resolve(file);
  if (resolved.endsWith('config.js')) return clientConfig;
  if (cache.has(resolved)) return cache.get(resolved).exports;
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved));
  const module = { exports: {} };
  cache.set(resolved, module);
  const localRequire = (relative) => {
    assert(
      relative.startsWith('.'),
      `Native client must not require Node dependencies: ${relative}`,
    );
    let destination = path.resolve(path.dirname(resolved), relative);
    if (!path.extname(destination)) destination += '.js';
    if (!fs.existsSync(destination) && destination.endsWith('.js'))
      destination = destination.slice(0, -3) + '.json';
    assert(destination.startsWith(root + path.sep), destination);
    return load(destination);
  };
  vm.runInNewContext(
    `(function(require,module,exports,wx,Page,Component,App,getApp,getCurrentPages){${fs.readFileSync(resolved, 'utf8')}\n})`,
    {},
    { filename: resolved },
  )(
    localRequire,
    module,
    module.exports,
    wx,
    (d) => (pageDefinition = d),
    (d) => (componentDefinition = d),
    () => {},
    () => application,
    () => [],
  );
  return module.exports;
}

(async () => {
  assert.deepEqual(
    app.tabBar.list.map((p) => p.text),
    ['机位', '发现', '出行', '我的'],
  );
  assert.equal(app.pages[0], 'pages/shots/index');
  for (const file of files.filter((f) => f.endsWith('.js') && !f.endsWith('config.local.js'))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    acorn.parse(source, { ecmaVersion: 'latest' });
    assert(
      !/require\(['"][^'"]+\.json['"]\)/.test(source),
      `Native runtime imports JavaScript modules, not JSON: ${file}`,
    );
  }
  for (const route of app.pages) {
    load(path.join(root, route + '.js'));
    const definition = pageDefinition;
    assert(definition && Object.hasOwn(definition.data, 'signedIn'), route);
    const template = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
    for (const match of template.matchAll(/(?:bind|catch)(?::?[a-z]+)="([a-zA-Z]\w*)"/g)) {
      assert.equal(typeof definition[match[1]], 'function', `${route}: ${match[1]}`);
    }
    assert(!template.includes('i18n.'), route);
    assert(!template.includes('&amp;&amp;'), `WXML expressions must use &&: ${route}`);
  }
  for (const name of ['remote-image', 'state-view']) {
    load(path.join(root, `components/${name}/index.js`));
    assert(componentDefinition && componentDefinition.methods);
  }
  assert.equal(app.tabBar.custom, true);
  load(path.join(root, 'custom-tab-bar/index.js'));
  const tabBar = {
    data: {},
    setData(update) {
      Object.assign(this.data, update);
    },
  };
  componentDefinition.methods.sync.call(tabBar, 'pages/map/index');
  assert.equal(tabBar.data.selected, 2);
  componentDefinition.methods.setUnread.call(tabBar, 3);
  assert.equal(application.globalData.unread, 3);
  assert.equal(tabBar.data.unread, 3);
  const network = load(path.join(root, 'services/network.js'));
  clientConfig.apiBase = 'http://127.0.0.1:4174';
  clientConfig.development = true;
  devicePlatform = 'devtools';
  assert.equal(network.backendOrigin(), clientConfig.apiBase);
  for (devicePlatform of ['ios', 'android', 'windows', 'mac'])
    assert.throws(() => network.backendOrigin(), /手机无法连接/);
  clientConfig.apiBase = 'https://campus.example.test';
  clientConfig.development = false;
  assert.equal(network.backendOrigin(), clientConfig.apiBase);
  assert.match(
    network.failure({ errMsg: 'request:fail url not in domain list' }).message,
    /合法域名/,
  );
  assert.match(network.failure({ errMsg: 'request:fail SSL certificate error' }).message, /证书/);
  assert.match(network.failure({ errMsg: 'request:fail timeout' }).message, /超时/);
  devicePlatform = 'devtools';
  const api = load(path.join(root, 'services/api.js'));
  const token = 'a'.repeat(64),
    account = { id: 'alice', nickname: 'Alice', bookmarks: [] };
  api.saveSession({ token, expiresAt: Date.now() + 100000, account });
  const pending = api.request('/api/checkins', 'POST', { note: 'private' });
  const req = requests.pop();
  assert.equal(req.url, 'https://campus.example.test/api/mini/checkins');
  assert.equal(req.header.Authorization, 'Bearer ' + token);
  assert(!('Cookie' in req.header));
  req.success({ statusCode: 201, data: { id: 'record' } });
  assert.equal((await pending).id, 'record');
  assert.equal(api.asset('https://attacker.invalid/a.jpg'), '');
  assert.equal(api.asset('/api/admin/works/photo'), '');
  assert.equal(api.asset('/shared/../data/secret'), '');
  assert(!api.asset('/media/private-id').includes(token));
  const privatePhoto = api.download('/media/private-id');
  const download = downloads.pop();
  assert.equal(download.header.Authorization, 'Bearer ' + token);
  assert(download.url.endsWith('/api/mini/media-file/private-id?size=thumb'));
  download.success({ statusCode: 200, tempFilePath: 'wxfile://private-alice' });
  await privatePhoto;
  const stale = api.request('/api/my/library');
  const old = requests.pop();
  api.clearSession();
  old.success({ statusCode: 200, data: { private: 'Alice' } });
  await assert.rejects(stale, /账号已改变/);
  assert(removed.includes('wxfile://private-alice'));
  assert.equal(api.session(), null);
  api.saveSession({ token, expiresAt: Date.now() + 100000, account });
  clientConfig.apiBase = 'https://another-backend.example.test';
  assert.equal(
    api.session(),
    null,
    'Changing backend must discard the previous backend credential',
  );
  assert.equal(storage.has('explore-mini-session-v1'), false);
  clientConfig.apiBase = 'https://campus.example.test';
  const latePhoto = api.download('/media/private-id');
  const late = downloads.pop();
  api.clearSession();
  late.success({ statusCode: 200, tempFilePath: 'wxfile://late' });
  await assert.rejects(latePhoto);
  assert(removed.includes('wxfile://late'));
  const model = load(path.join(root, 'services/model.js'));
  // Published seed points really have null covers; the web reference images must also show natively.
  for (const [point, expected] of [
    [{ id: 'nmu1', theme: '建筑', cover: null }, '/shared/nmu-library.jpg'],
    [{ id: 'nmu2', theme: '建筑' }, '/shared/nmu-building.jpg'],
    [{ id: 'nmu3', theme: '自然' }, '/shared/nmu-campus.jpg'],
  ]) {
    const view = model.pointView(point);
    assert.equal(view.photo, expected);
    assert.equal(view.photoIsReference, true);
    assert(fs.existsSync(path.resolve('dist' + expected)));
    assert.equal(api.asset(view.photo), clientConfig.apiBase + expected + '?size=thumb');
  }
  const coverPoint = model.pointView({
    cover: '/media/published-cover',
    matchingSpots: [{ photo: '/api/shooting-spots/published/photo' }],
  });
  assert.equal(coverPoint.photo, '/media/published-cover');
  assert.equal(coverPoint.photoIsReference, false);
  const examplePoint = model.pointView({
    cover: null,
    matchingSpots: [{ photo: null }, { photo: '/api/shooting-spots/published/photo' }],
  });
  assert.equal(examplePoint.photo, '/api/shooting-spots/published/photo');
  assert.equal(examplePoint.photoIsReference, false);
  const detailTemplate = fs.readFileSync(path.join(root, 'pages/detail/index.wxml'), 'utf8');
  assert(detailTemplate.includes('data-photo="{{point.photo}}"'));
  assert(detailTemplate.includes('source="{{point.photo}}"'));
  const points = [
    { id: 'far', lat: 38.6, lng: 106.1 },
    { id: 'near-disliked', lat: 38.5, lng: 106.1, myReaction: 'dislike' },
    { id: 'near', lat: 38.501, lng: 106.1 },
  ];
  assert.deepEqual(
    Array.from(model.nearby(points, { lat: 38.5, lng: 106.1 }), (p) => p.id),
    ['near', 'far', 'near-disliked'],
  );
  const coords = load(path.join(root, 'services/coordinates.js'));
  const point = { lng: 106.106, lat: 38.495 },
    roundtrip = coords.fromTencent(coords.toTencent(point));
  assert(Math.abs(point.lng - roundtrip.lng) < 1e-7 && Math.abs(point.lat - roundtrip.lat) < 1e-7);
  const painter = load(path.join(root, 'services/atlas.js'));
  const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    hole = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
    ];
  const rings = [];
  let current;
  painter.path(
    {
      beginPath() {},
      moveTo(x, y) {
        current = [[x, y]];
      },
      lineTo(x, y) {
        current.push([x, y]);
      },
      closePath() {
        rings.push(current);
      },
    },
    { outline: outer, holes: [hole] },
  );
  assert(
    painter.area(rings[0]) * painter.area(rings[1]) < 0,
    'Courtyard holes must not be painted as a roof',
  );
  console.log(
    'Mini-program routes, Chinese-only UI, bearer isolation, private photo lifecycle, personal ranking and coordinate contracts passed.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
