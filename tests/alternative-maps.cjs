const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../dist/shared', f), 'utf8'),
  mod = (s) => import('data:text/javascript;base64,' + Buffer.from(s).toString('base64'));
(async () => {
  const coordinates = await mod(read('coordinates.js')),
    routing = await mod(read('routing.js')),
    provider = await mod(read('map-provider.js'));
  const density = await mod(read('map-density.js'));
  global.__alternative = { ...coordinates, ...routing, ...density };
  const services = await mod(
    'const {toTencent,fromTencent,toBaidu,fromBaidu,distance}=globalThis.__alternative;\n' +
      read('alternative-services.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  const a = { lng: 106.091, lat: 38.499 },
    b = { lng: 106.099, lat: 38.4995 };
  for (const p of [a, b, { lng: 116.404, lat: 39.915 }]) {
    const back = coordinates.fromBaidu(coordinates.toBaidu(p));
    assert(routing.distance(p, back) < 0.2, 'BD09 round trip must not shift campus point');
  }
  const ca = coordinates.toTencent(a),
    cb = coordinates.toTencent(b),
    ba = coordinates.toBaidu(a),
    bb = coordinates.toBaidu(b);
  let received,
    clears = 0;
  const A = {
    Walking: class {
      search(from, to, callback) {
        received = [from, to];
        callback('complete', {
          routes: [
            {
              distance: 900,
              duration: 720,
              steps: [{ path: [ca, cb], instruction: '<b>向右转</b>进入校园路', distance: 900 }],
            },
          ],
        });
      }
      clearResults() {
        clears++;
      }
    },
  };
  const amap = await services.alternativeWalking('amap', A, a, b);
  assert.deepEqual(received, [
    [ca.lng, ca.lat],
    [cb.lng, cb.lat],
  ]);
  assert.equal(amap.duration, 12);
  assert.equal(amap.length, 900);
  assert.equal(amap.steps[0].instruction, '向右转进入校园路');
  assert(routing.distance(amap.path[0], a) < 0.01);
  assert.equal(clears, 1);
  class Point {
    constructor(lng, lat) {
      this.lng = lng;
      this.lat = lat;
    }
  }
  const B = {
    Point,
    WalkingRoute: class {
      constructor(p, o) {
        this.options = o;
      }
      search(from, to) {
        received = [from, to];
        queueMicrotask(() =>
          this.options.onSearchComplete({
            getNumPlans: () => 1,
            getPlan: () => ({
              getDistance: () => 1000,
              getDuration: () => 840,
              getNumRoutes: () => 1,
              getRoute: () => ({
                getPath: () => [ba, bb],
                getNumSteps: () => 1,
                getStep: () => ({
                  getDescription: () => '<span>左转</span>',
                  getDistance: () => 1000,
                }),
              }),
            }),
          }),
        );
      }
      getStatus() {
        return 0;
      }
      clearResults() {
        clears++;
      }
    },
  };
  const baidu = await services.alternativeWalking('baidu', B, a, b);
  assert.equal(received[0].lng, ba.lng);
  assert.equal(baidu.duration, 14);
  assert.equal(baidu.steps[0].instruction, '左转');
  assert(routing.distance(baidu.path.at(-1), b) < 0.2);
  assert.deepEqual(baidu.connectors, []);
  assert.equal(
    (
      await services.alternativeWalking(
        'amap',
        {
          Walking: class {
            search(a, b, callback) {
              callback('error', { info: 'INVALID_USER_KEY' });
            }
          },
        },
        a,
        b,
      )
    ).available,
    false,
  );
  assert.equal(
    (await services.alternativeWalking('baidu', B, a, b, { alive: () => false })).available,
    false,
  );
  assert.equal(provider.mapConfigured({ map: { provider: 'amap', amapKey: 'fixture' } }), true);
  assert.equal(
    provider.mapConfigured({ map: { provider: 'baidu', tencentKey: 'wrongProvider' } }),
    false,
  );
  let scripts = [];
  global.window = {};
  global.location = { origin: 'https://test.example' };
  global.document = {
    createElement: () => ({
      remove() {
        this.removed = true;
      },
    }),
    head: { append: (s) => scripts.push(s) },
  };
  const loader = await mod(read('alternative-sdk.js'));
  await assert.rejects(loader.loadAlternative('amap', {}), /尚未配置/);
  const pending = loader.loadAlternative('amap', { amapKey: 'a' });
  assert.equal(loader.loadAlternative('amap', { amapKey: 'a' }), pending);
  await assert.rejects(loader.loadAlternative('amap', { amapKey: 'b' }), /刷新/);
  assert.equal(window._AMapSecurityConfig.serviceHost, 'https://test.example/_AMapService');
  assert(!JSON.stringify(window._AMapSecurityConfig).includes('jscode'));
  scripts[0].onerror();
  await assert.rejects(pending, /连接失败/);
  const retry = loader.loadAlternative('amap', { amapKey: 'a' });
  window.AMap = A;
  window[new URL(scripts.at(-1).src).searchParams.get('callback')]();
  assert.equal(await retry, A);
  await assert.rejects(loader.loadAlternative('amap', { amapKey: 'b' }), /刷新/);
  const bd = loader.loadAlternative('baidu', { baiduKey: 'bd' });
  window.BMapGL = B;
  window[new URL(scripts.at(-1).src).searchParams.get('callback')]();
  assert.equal(await bd, B);
  let callback,
    geoOptions,
    clearNative = 0,
    watchCallback;
  global.__alternative.loadAlternative = async () => ({
    Geolocation: class {
      constructor(o) {
        geoOptions = o;
      }
      getCurrentPosition(cb) {
        callback = cb;
      }
    },
  });
  const geo = await mod(
    'const {loadAlternative,fromTencent}=globalThis.__alternative;\n' +
      read('alternative-location.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  let fixes = 0,
    errors = 0;
  const loc = geo.alternativeLocation({ map: { provider: 'amap' } }),
    id = loc.watchPosition(
      () => fixes++,
      () => errors++,
    );
  await new Promise((r) => setImmediate(r));
  assert.equal(geoOptions.noIpLocate, 3);
  geo.alternativeLocation({ map: { provider: 'amap' } }).clearWatch(id);
  callback('complete', { position: { getLng: () => ca.lng, getLat: () => ca.lat }, accuracy: 10 });
  assert.equal(fixes, 0, 'A fresh adapter must be able to stop a prior watch');
  loc.getCurrentPosition(
    () => fixes++,
    () => errors++,
  );
  await new Promise((r) => setImmediate(r));
  callback('complete', { position: {}, accuracy: 10, location_type: 'ip' });
  assert.equal(errors, 1);
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        watchPosition(cb, err, options) {
          watchCallback = cb;
          assert.equal(options.maximumAge, 0);
          return 9;
        },
        clearWatch(id) {
          assert.equal(id, 9);
          clearNative++;
        },
      },
    },
  });
  const bdloc = geo.alternativeLocation({ map: { provider: 'baidu' } }),
    bid = bdloc.watchPosition(() => fixes++);
  bdloc.clearWatch(bid);
  watchCallback({ coords: { longitude: 1, latitude: 2 } });
  assert.equal(fixes, 0);
  assert.equal(clearNative, 1);
  const tencent = await mod(
    'const {toTencent}=globalThis.__alternative;\n' +
      read('tencent-links.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  Object.assign(global.__alternative, tencent);
  const links = await mod(
    'const {tencentLinks,toTencent,toBaidu}=globalThis.__alternative;\n' +
      read('map-links.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  const al = links.mapLinks('amap', { ...b, name: '校园终点' }, a, {}, { mobile: true }),
    bl = links.mapLinks(
      'baidu',
      { ...b, name: '校园终点' },
      a,
      {},
      { mobile: true, platform: 'ios' },
    );
  assert.equal(new URL(al.native).searchParams.get('mode'), 'walk');
  assert.equal(new URL(al.web).searchParams.get('callnative'), '0');
  assert.equal(new URL(bl.native).searchParams.get('coord_type'), 'bd09ll');
  assert.equal(new URL(bl.native).searchParams.get('mode'), 'walking');

  const controls = [],
    listeners = new Map(),
    maps = [];
  global.document = {
    createElement: () => ({
      style: {},
      nodes: {},
      classList: { toggle() {} },
      querySelector(s) {
        return (this.nodes[s] ??= {
          attrs: {},
          setAttribute(k, v) {
            this.attrs[k] = v;
          },
          getAttribute(k) {
            return this.attrs[k];
          },
        });
      },
      setAttribute() {},
      contains: () => false,
      remove() {
        this.removed = true;
      },
    }),
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  class Overlay {
    constructor(...args) {
      this.args = args;
      this.events = {};
    }
    on(k, f) {
      this.events[k] = f;
    }
    addEventListener(k, f) {
      this.events[k] = f;
    }
  }
  class MapSDK {
    constructor(element, options) {
      this.element = element;
      this.options = options;
      this.items = new Set();
      this.events = {};
      this.zoom = 16;
      maps.push(this);
    }
    add(item) {
      this.items.add(item);
    }
    remove(item) {
      this.items.delete(item);
    }
    addOverlay(item) {
      this.add(item);
    }
    removeOverlay(item) {
      this.remove(item);
    }
    on(k, f) {
      this.events[k] = f;
    }
    addEventListener(k, f) {
      this.on(k, f);
    }
    centerAndZoom() {
      this.centered = true;
    }
    enableScrollWheelZoom(v) {
      this.scroll = v;
    }
    panTo(p) {
      this.pan = p;
    }
    setBounds() {
      this.fit = true;
    }
    setViewport() {
      this.fit = true;
    }
    getZoom() {
      return this.zoom;
    }
    setZoom(z) {
      this.zoom = z;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const sdkMap = {
    Map: MapSDK,
    LngLat: Point,
    Point,
    Pixel: Point,
    Size: Point,
    Icon: Overlay,
    Bounds: Overlay,
    Marker: Overlay,
    Polyline: Overlay,
    Polygon: Overlay,
  };
  global.__alternative = {
    ...global.__alternative,
    loadAlternative: async () => sdkMap,
    campusWalking: async (_sdk, _key, start, target) => ({
      available: true,
      path: [
        [start.lng, start.lat],
        [target.lng, target.lat],
      ],
      length: 100,
      duration: 2,
    }),
  };
  const mapApi = await mod(
    'const featureVisible=()=>true; const {loadAlternative,alternativeWalking,toTencent,fromTencent,toBaidu,fromBaidu,campusWalking,distance,visibleMapPoints,mapDot}=globalThis.__alternative;\n' +
      read('alternative-map.js').replace(/^import [\s\S]*?;\r?\n/gm, ''),
  );
  for (const name of ['amap', 'baidu']) {
    const element = {
        isConnected: true,
        classList: { add() {}, remove() {} },
        append(...items) {
          controls.push(...items);
        },
      },
      catalog = {
        map: { provider: name },
        campus: {
          center: [a.lng, a.lat],
          boundary: [
            [106.09, 38.49],
            [106.1, 38.49],
            [106.1, 38.51],
            [106.09, 38.51],
          ],
        },
        points: [
          { ...a, id: 'start' },
          { ...b, id: 'end', trust: 'community' },
        ],
      };
    let chosen;
    const adapter = await mapApi.alternativeMap(element, catalog, {
      onPoint: (id) => (chosen = id),
      routeStops: catalog.points,
    });
    await adapter.referenceReady;
    assert.equal(adapter.reference.length, 100);
    const rendered = maps.at(-1);
    assert(name === 'amap' ? rendered.options.scrollWheel : rendered.scroll);
    adapter.select('end', { pan: false });
    assert.equal(rendered.pan, undefined);
    adapter.focus('start');
    assert(rendered.pan);
    adapter.filter(['end']);
    const pins = [...rendered.items].filter((i) => i.events.click);
    assert.equal(pins.length, 1);
    pins[0].events.click({ domEvent: { stopPropagation() {} } });
    assert.equal(chosen, 'end');
    adapter.pick(a);
    adapter.pick(null);
    const leg = await adapter.plan(a, b);
    assert.equal(leg.available, true);
    assert(rendered.fit);
    await adapter.navigation(null);
    adapter.destroy();
    adapter.destroy();
    assert.equal(rendered.items.size, 0);
    assert(rendered.destroyed);
    assert.equal(listeners.size, 0);
    assert.equal(await adapter.navigation(a, b), null);
  }
  console.log(
    'PASS: AMap/Baidu SDK contracts, WGS84/GCJ02/BD09 fixtures, walking duration/steps, denial/cancel, loader dedupe/retry/key change, protected proxy configuration, precise location/no IP fallback/stale cleanup and matching map links. Owner Keys are required for live provider testing.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
