const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const moduleOf = (source) =>
  import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const KEY = 'TEST1-TEST2-TEST3-TEST4-TEST5-TEST6';
async function adapterChecks() {
  const coordinates = await moduleOf(read('dist/shared/coordinates.js')),
    routing = await moduleOf(read('dist/shared/routing.js'));
  global.__tencentTest = { ...coordinates, ...routing };
  const services = await moduleOf(
    'const {toTencent,fromTencent,distance}=globalThis.__tencentTest;\n' +
      read('dist/shared/tencent-services.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  const guide = await moduleOf(
    'const {distance,direction,meters}=globalThis.__tencentTest;\n' +
      read('dist/shared/guidance.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  Object.assign(global.__tencentTest, services, guide);
  const walking = await moduleOf(
    'const {tencentWalking,distance}=globalThis.__tencentTest;\n' +
      read('dist/shared/campus-walking.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  Object.assign(global.__tencentTest, walking);
  const source = read('dist/shared/tencent-map.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
    api = await moduleOf(
      'const {toTencent,fromTencent,campusWalking,routeProgress}=globalThis.__tencentTest; const tencentBuildings=()=>({async show(){return null;},destroy(){}});\n' +
        source,
    );
  for (const p of [
    { lng: 116.404, lat: 39.915 },
    { lng: 106.137, lat: 38.501 },
    { lng: 106.129, lat: 38.494 },
  ]) {
    const converted = coordinates.toTencent(p),
      back = coordinates.fromTencent(converted);
    assert.ok(Math.abs(converted.lng - p.lng) > 0.001);
    assert.ok(Math.abs(back.lng - p.lng) < 1e-8 && Math.abs(back.lat - p.lat) < 1e-8);
  }
  const sample = coordinates.toTencent({ lng: 116.404, lat: 39.915 });
  assert.ok(Math.abs(sample.lng - 116.41024449916938) < 1e-10);
  assert.ok(Math.abs(sample.lat - 39.91640428150164) < 1e-10);
  assert.deepEqual(coordinates.toTencent([-122, 37]), { lng: -122, lat: 37 });
  assert.deepEqual(coordinates.fromTencent([-122, 37]), { lng: -122, lat: 37 });
  assert.throws(() => coordinates.toTencent({ lng: NaN, lat: 38 }));
  assert.throws(() => coordinates.toTencent([106, 91]));
  let scripts = [],
    removed = 0;
  global.window = {};
  global.document = {
    events: {},
    addEventListener(k, f) {
      this.events[k] = f;
    },
    removeEventListener(k, f) {
      if (this.events[k] === f) delete this.events[k];
    },
    createElement: () => ({
      nodes: {},
      events: {},
      children: [],
      classList: { toggle() {} },
      append(...n) {
        this.children.push(...n);
      },
      contains(n) {
        return this.children.includes(n);
      },
      getAttribute(k) {
        return this[k];
      },
      focus() {
        this.focused = true;
      },
      remove() {
        removed++;
        this.removed = true;
      },
      setAttribute(k, v) {
        this[k] = v;
      },
      addEventListener(k, f) {
        this.events[k] = f;
      },
      querySelector(s) {
        return (this.nodes[s] ??= {
          style: {},
          setAttribute(k, v) {
            this[k] = v;
          },
        });
      },
    }),
    head: { append: (s) => scripts.push(s) },
  };
  global.matchMedia = () => ({ matches: false });
  await assert.rejects(api.loadTencent(''), /尚未配置/);
  assert.equal(scripts.length, 0);
  const failure = api.loadTencent(KEY),
    same = api.loadTencent(KEY);
  assert.equal(failure, same);
  assert.equal(scripts.length, 1);
  assert.equal(new URL(scripts[0].src).origin, 'https://map.qq.com');
  scripts[0].onerror();
  await assert.rejects(failure, /无法连接/);
  assert.equal(removed, 1);
  let maps = [],
    layers = [];
  class LatLng {
    constructor(lat, lng) {
      this.lat = lat;
      this.lng = lng;
    }
    getLat() {
      return this.lat;
    }
    getLng() {
      return this.lng;
    }
  }
  class Bounds {
    constructor(sw, ne) {
      assert(sw && ne);
      this.values = [sw, ne];
    }
    extend(p) {
      this.values.push(p);
      return this;
    }
  }
  class MapSDK {
    constructor(el, options) {
      this.el = el;
      this.options = options;
      this.rotation = 0;
      this.pitch = 0;
      this.zoom = options.zoom;
      this.events = {};
      maps.push(this);
      setImmediate(() => this.events.tilesloaded?.());
    }
    on(name, fn) {
      this.events[name] = fn;
    }
    removeControl(id) {
      (this.removedControls ??= []).push(id);
    }
    getControl(id) {
      assert.equal(id, 'zoom');
      return { setPosition: (p) => (this.zoomPosition = p) };
    }
    getZoom() {
      return this.zoom;
    }
    setZoom(z) {
      this.zoom = z;
      this.events.zoom?.();
    }
    getRotation() {
      return this.rotation;
    }
    getPitch() {
      return this.pitch;
    }
    setRotation(r) {
      this.rotateTo(((r % 360) + 360) % 360, {});
    }
    setPitch(p) {
      this.pitchTo(p, {});
    }
    rotateTo(r, options) {
      this.rotation = r;
      this.motion = options;
      this.events.rotate?.();
    }
    pitchTo(p, options) {
      this.pitch = p;
      this.motion = options;
      this.events.pitch?.();
    }
    fitBounds(b, options) {
      this.bounds = b;
      this.fit = options;
    }
    easeTo(view, options) {
      this.view = view;
      this.motion = options;
      if ('rotation' in view) this.rotateTo(view.rotation, options);
      if ('pitch' in view) this.pitchTo(view.pitch, options);
    }
    panTo(p) {
      this.pan = p;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Style {
    constructor(options) {
      Object.assign(this, options);
    }
  }
  class Layer {
    constructor(options) {
      Object.assign(this, options);
      this.events = {};
      layers.push(this);
    }
    on(name, fn) {
      this.events[name] = fn;
    }
    setGeometries(g) {
      this.geometries = g;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const T = {
    service: {
      Walking: class {
        async search({ from, to }) {
          return {
            status: 0,
            result: {
              routes: [
                {
                  distance: 220,
                  duration: 3,
                  polyline: [from, new LatLng(from.lat, to.lng), to],
                  steps: [],
                },
              ],
            },
          };
        }
      },
    },
    Map: MapSDK,
    LatLng,
    LatLngBounds: Bounds,
    MultiPolygon: Layer,
    PolygonStyle: Style,
    MultiMarker: Layer,
    MarkerStyle: Style,
    MultiCircle: Layer,
    CircleStyle: Style,
    MultiPolyline: Layer,
    PolylineStyle: Style,
    constants: {
      DEFAULT_CONTROL_ID: { ROTATION: 'rotation', ZOOM: 'zoom' },
      CONTROL_POSITION: { BOTTOM_RIGHT: 'bottom-right' },
    },
  };
  const success = api.loadTencent(KEY);
  window.TMap = T;
  const callback = new URL(scripts.at(-1).src).searchParams.get('callback');
  window[callback]();
  assert.equal(await success, T);
  assert.equal(window[callback], undefined);
  assert.equal(await api.loadTencent(KEY), T);
  assert.equal(scripts.length, 2);
  await assert.rejects(api.loadTencent('OTHER-KEY'), /刷新/);
  const a = { id: 'a', name: '起点', lng: 106, lat: 38 },
    b = { id: 'b', name: '终点', lng: 106.001, lat: 38.001 };
  const catalog = {
    map: { provider: 'tencent', tencentKey: KEY },
    campus: {
      center: [106, 38],
      boundary: [
        [105.999, 37.999],
        [106.002, 37.999],
        [106.002, 38.002],
        [105.999, 38.002],
      ],
    },
    points: [a, b],
  };
  const geo = {
    metadata: { fetchedAt: '2026-10-07' },
    features: [
      {
        properties: { kind: 'footway' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [106, 38],
            [106.001, 38],
            [106.001, 38.001],
          ],
        },
      },
    ],
  };
  const original = JSON.stringify(catalog),
    element = {
      isConnected: true,
      classList: { add() {}, remove() {} },
      replaceChildren() {},
      append(n) {
        if (n.className === 'map-orientation') this.orientation = n;
        else if (n.className === 'map-zoom') this.zoom = n;
        else this.notice = n;
      },
    };
  let selected,
    picked,
    pickAllowed = true;
  const map = await api.tencentMap(element, catalog, geo, {
    onPoint: (id) => (selected = id),
    onPick: (p) => (picked = p),
    canPick: () => pickAllowed,
    routeStops: [a, b],
    trail: [a, b],
    inside: (p) => p.lng < 107,
  });
  await map.referenceReady;
  assert.equal(map.provider, 'tencent');
  assert.equal(
    element.notice.removed,
    true,
    'Loaded map must remove the persistent top-left label',
  );
  assert.equal(map.reference.missing, 0);
  assert.ok(map.reference.length > 100);
  assert.equal(JSON.stringify(catalog), original);
  const sdk = maps.at(-1),
    layer = (id) => layers.find((l) => l.id === id),
    pins = layer('campus-points');
  assert.equal(sdk.options.scrollable, true);
  assert.equal(sdk.options.viewMode, '3D');
  assert.equal(sdk.options.rotatable, true);
  assert.equal(sdk.options.pitchable, true);
  assert.equal(sdk.options.pitch, 0);
  assert.equal(sdk.options.touchZoomable, true);
  assert.equal(
    sdk.el.className,
    'tencent-map-surface',
    'Own buttons must remain outside the SDK event container',
  );
  assert.deepEqual(sdk.removedControls, ['rotation', 'zoom']);
  const compass = element.orientation,
    panel = compass.children[1],
    toggle = compass.children[0],
    clickView = (view) => {
      let stopped = false;
      compass.events.click({
        stopPropagation() {
          stopped = true;
        },
        target: { closest: () => ({ dataset: { view } }) },
      });
      assert.equal(stopped, false, 'Sibling controls must reach the global glass feedback layer');
    };
  assert.equal(toggle['aria-expanded'], 'false');
  assert.equal(panel.inert, true);
  toggle.events.click();
  assert.equal(toggle['aria-expanded'], 'true');
  assert.equal(panel.inert, false);
  document.events.pointerdown({ target: toggle });
  assert.equal(toggle['aria-expanded'], 'true');
  document.events.pointerdown({ target: {} });
  assert.equal(toggle['aria-expanded'], 'false');
  toggle.events.click();
  document.events.keydown({ key: 'Escape' });
  assert.equal(toggle.focused, true);
  assert.equal(panel.inert, true);
  const zoom = element.zoom;
  zoom.events.click({ target: { closest: () => ({ dataset: { zoom: '1' } }) } });
  assert.equal(sdk.zoom, 17);
  zoom.events.click({ target: { closest: () => ({ dataset: { zoom: '-1' } }) } });
  assert.equal(sdk.zoom, 16);
  sdk.setZoom(20);
  assert.equal(zoom.nodes['[data-zoom="1"]'].disabled, true);
  zoom.events.click({ target: { closest: () => ({ dataset: { zoom: '1' } }) } });
  assert.equal(sdk.zoom, 20);
  sdk.setZoom(14);
  assert.equal(zoom.nodes['[data-zoom="-1"]'].disabled, true);
  clickView('right');
  assert.equal(sdk.rotation, 45);
  assert.equal(panel.nodes['.map-compass-arrow'].style.transform, 'rotate(-45deg)');
  clickView('left');
  assert.equal(sdk.rotation, 0);
  clickView('left');
  assert.equal(sdk.rotation, 315);
  assert.equal(panel.nodes['.map-compass-arrow'].style.transform, 'rotate(45deg)');
  clickView('pitch');
  assert.equal(sdk.pitch, 45);
  assert.equal(panel.nodes['[data-view="pitch"]']['aria-pressed'], 'true');
  clickView('pitch');
  assert.equal(sdk.pitch, 0);
  clickView('pitch');
  clickView('north');
  assert.equal(sdk.rotation, 0);
  assert.equal(sdk.pitch, 0);
  assert.equal(panel.nodes['[data-view="pitch"]']['aria-pressed'], 'false');
  clickView('north');
  sdk.view = undefined;
  assert.equal(pins.geometries[0].styleId, 'stop1');
  assert.ok(Math.abs(pins.geometries[0].position.lng - a.lng) > 0.001);
  map.select('b', { pan: false });
  assert.equal(pins.geometries[1].styleId, 'selected');
  assert.equal(sdk.view, undefined);
  map.focus('a');
  assert.equal(sdk.view.zoom, 18);
  assert.equal(pins.geometries[0].rank, 1000);
  map.select(null);
  assert.equal(pins.geometries[0].styleId, 'stop1');
  const oldView = sdk.view;
  map.filter(['b']);
  assert.deepEqual(
    pins.geometries.map((g) => g.id),
    ['b'],
  );
  map.select('b', { pan: false });
  assert.equal(pins.geometries[0].styleId, 'selected');
  assert.equal(sdk.view, oldView, 'Filtering does not move or rebuild the map');
  map.filter([]);
  assert.equal(pins.geometries.length, 0);
  map.filter(['a', 'b']);
  assert.equal(pins.geometries.length, 2);
  pins.events.click({ geometry: { id: 'b' } });
  assert.equal(selected, 'b');
  const clicked = coordinates.toTencent({ lng: 106.0007, lat: 38.0004 });
  sdk.events.click({ latLng: new LatLng(clicked.lat, clicked.lng) });
  assert.ok(Math.abs(picked.lng - 106.0007) < 1e-8);
  assert.ok(Math.abs(picked.lat - 38.0004) < 1e-8);
  pickAllowed = false;
  picked = null;
  sdk.events.click({ latLng: new LatLng(clicked.lat, clicked.lng) });
  assert.equal(picked, null);
  const labels = [];
  document.events['content-translation:collect']({
    detail: { roots: [{ contains: (n) => n === element }], entries: labels, previous: new Map() },
  });
  assert.equal(labels.length, 2);
  labels[1].set('Destination');
  assert.equal(pins.geometries.find((g) => g.id === 'b').content, 'Destination');
  assert.equal(pins.geometries.find((g) => g.id === 'b').styleId, 'selected');
  assert.equal(JSON.stringify(catalog), original);
  labels[1].set(labels[1].before);
  assert.equal(pins.geometries.find((g) => g.id === 'b').content, '终点');
  map.pick(a);
  assert.ok(layer('campus-positions').geometries.some((g) => g.id === 'pick'));
  map.pick(null);
  assert.ok(!layer('campus-positions').geometries.some((g) => g.id === 'pick'));
  const leg = await map.plan(a, b);
  assert.equal(leg.available, true);
  assert.ok(Math.abs(leg.path[0][0] - a.lng) < 1e-8);
  assert.ok(layer('walking-guide').geometries[0].paths[0].getLng() !== a.lng);
  assert.ok(layer('campus-positions').geometries.some((g) => g.id === 'end'));
  const fitted = sdk.bounds;
  await map.plan(a, b, { fit: false });
  assert.equal(sdk.bounds, fitted);
  assert.equal((await map.navigation(a, b)).available, true);
  assert.equal(layer('walking-guide').geometries[0].styleId, 'green');
  await map.navigation(null);
  assert.deepEqual(layer('walking-guide').geometries, []);
  map.trail([]);
  assert.deepEqual(layer('recorded-trail').geometries, []);
  map.trail([a, b]);
  assert.equal(layer('recorded-trail').geometries[0].paths.length, 2);
  map.locate({ ...a, accuracy: 10 }, { follow: false });
  assert.equal(sdk.pan, undefined);
  assert.equal(layer('position-accuracy').geometries[0].radius, 10);
  map.locate({ ...b, accuracy: 20 });
  assert.ok(sdk.pan);
  const pan = sdk.pan;
  map.locate({ lng: 108, lat: 38, accuracy: 30 });
  assert.equal(sdk.pan, pan);
  map.navigationView(true, { position: { ...a, accuracy: 10 } });
  assert.equal(sdk.zoom, 18);
  const navBounds = sdk.bounds;
  map.locate({ ...b, accuracy: 10 });
  sdk.events.resize();
  assert.equal(sdk.bounds, navBounds, 'Fullscreen resize must not fit entire route');
  assert.equal(sdk.pan.lng, coordinates.toTencent(b).lng);
  map.navigationView(true, { follow: false });
  const pausedPan = sdk.pan;
  sdk.events.resize();
  assert.equal(sdk.pan, pausedPan, 'Paused follow stays paused through resize');
  map.navigationView(false);
  assert.notEqual(sdk.bounds, navBounds, 'Exit restores fitted view');
  sdk.events.context_lost();
  assert.match(element.notice.textContent, /显示中断/);
  map.overview();
  sdk.events.resize();
  map.destroy();
  map.destroy();
  assert(sdk.destroyed && layers.every((l) => l.destroyed));
  assert(compass.removed && zoom.removed);
  assert.equal(document.events.pointerdown, undefined);
  const rotationAfterDestroy = sdk.rotation;
  clickView('right');
  assert.equal(sdk.rotation, rotationAfterDestroy);
  assert.equal(await map.navigation(a, b), null);
  assert.equal((await map.plan(a, b)).available, false);
  const hidden = { isConnected: false };
  const abandoned = await api.tencentMap(hidden, catalog, geo);
  abandoned.destroy();
  assert.equal(maps.length, 1);
  const pickedOnly = await api.tencentMap(element, catalog, geo, { onPick: () => false });
  const pickSDK = maps.at(-1);
  pickSDK.events.click({ latLng: new LatLng(clicked.lat, clicked.lng) });
  assert.deepEqual(layers.filter((l) => l.id === 'campus-positions').at(-1).geometries, []);
  pickedOnly.destroy();
  let quotaCalls = 0;
  const oldWalking = T.service.Walking;
  T.service.Walking = class {
    async search() {
      quotaCalls++;
      throw { status: 121 };
    }
  };
  const c = { id: 'c', name: '第三站', lng: 106.0015, lat: 38.0015 };
  try {
    const quotaMap = await api.tencentMap(element, catalog, geo, { routeStops: [b, c, a] });
    await quotaMap.referenceReady;
    assert.equal(quotaCalls, 1, 'Daily quota errors must stop further automatic leg requests');
    assert.equal(quotaMap.reference.missing, 2);
    assert.equal(quotaMap.reference.loading, false);
    assert.match(quotaMap.reference.reason, /每日额度/);
    quotaMap.destroy();
  } finally {
    T.service.Walking = oldWalking;
  }
  const realTimeout = global.setTimeout,
    oldMap = T.Map;
  T.Map = class extends MapSDK {
    on(name, fn) {
      if (name !== 'tilesloaded') super.on(name, fn);
    }
  };
  global.setTimeout = (fn, delay, ...args) =>
    delay === 15000 ? setImmediate(fn, ...args) : realTimeout(fn, delay, ...args);
  try {
    await assert.rejects(api.tencentMap(element, catalog, geo), /底图加载超时/);
    assert.ok(maps.at(-1).destroyed);
    assert.ok(layers.every((l) => l.destroyed));
  } finally {
    global.setTimeout = realTimeout;
    T.Map = oldMap;
  }
  console.log(
    'Tencent adapter checks passed: coordinate fixtures / inverse / immutability, SDK failure retry / deduplication / key changes, selections, point picking, route and trail display, GPS and cleanup. SDK is simulated; an owner Key is required for live integration.',
  );
}
(async () => {
  await adapterChecks();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
