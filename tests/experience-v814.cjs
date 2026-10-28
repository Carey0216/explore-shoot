const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  cp = require('node:child_process');
const cinema = require('../miniprogram/services/collection-cinema');
const atlas = {
  photoWidth: 1200,
  photoHeight: 3000,
  planWidth: 1300,
  planHeight: 700,
  buildings: [],
};
const roof = {
  id: 'photo:one',
  frame: 'photo',
  collected: true,
  outline: [
    [500, 1400],
    [560, 1400],
    [560, 1430],
    [500, 1430],
  ],
  holes: [],
};
atlas.buildings = [roof];
assert.deepEqual(cinema.bounds(1440, 900, { left: 480, width: 480 }), {
  width: 480,
  height: 900,
  left: 480,
});
assert.deepEqual(cinema.bounds(320, 568, { left: -20, width: 480 }), {
  width: 320,
  height: 568,
  left: 0,
});
function surface() {
  let w = 0,
    h = 0,
    resizes = 0;
  const ctx = new Proxy(
    { getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) },
    { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => ((o[k] = v), true) },
  );
  return {
    get width() {
      return w;
    },
    set width(v) {
      resizes++;
      w = v;
    },
    get height() {
      return h;
    },
    set height(v) {
      resizes++;
      h = v;
    },
    getContext: () => ctx,
    get resizes() {
      return resizes;
    },
  };
}
const visible = surface(),
  buffer = surface(),
  cache = { surface: buffer },
  image = {};
cinema.render(visible, image, atlas, [roof.id], 390, 750, 1, 0, cache);
const visibleResizes = visible.resizes,
  bufferResizes = buffer.resizes;
cinema.render(visible, image, atlas, [roof.id], 390, 750, 1, 1400, cache);
cinema.render(visible, image, atlas, [roof.id], 390, 750, 1, 0, cache);
assert.equal(
  visible.resizes,
  visibleResizes,
  'Impact/replay must not resize or blank the visible canvas',
);
assert.equal(buffer.resizes, bufferResizes, 'Replaying reuses prepared map pixels');
for (const [w, h] of [
  [320, 568],
  [390, 750],
  [1440, 900],
  [844, 390],
]) {
  const l = cinema.layout(w, h, atlas, roof),
    start = cinema.pose(0, l),
    end = cinema.pose(cinema.duration, l);
  assert(l.box.width * start.scale >= w * 1.19, 'Opening roof must cover viewport width');
  assert(l.box.height * start.scale >= h * 1.19, 'Opening roof must cover viewport height');
  assert.equal(start.x, w / 2);
  assert.equal(start.y, h / 2);
  assert(l.startScale > 10, 'Viewport coverage is not a fixed tiny three-times card scale');
  assert.equal(end.scale, 1);
  assert.equal(end.x, l.target.x);
  assert.equal(end.y, l.target.y);
  assert.equal(end.shake, 0);
  assert(!cinema.pose(cinema.impactAt - 1, l).landed);
  assert(cinema.pose(cinema.impactAt, l).landed);
  assert(
    Math.abs(cinema.pose(cinema.impactAt + 35, l).shake) > 20,
    'Landing has visible screen-space displacement',
  );
  const inverse = l.sourceCenter;
  assert(Math.abs(l.map.x + (inverse[1] * l.map.width) / l.worldW - l.target.x) < 0.001);
  assert(
    Math.abs(l.map.y + ((l.sourceW - inverse[0]) * l.map.width) / l.worldW - l.target.y) < 0.001,
  );
}
// Periodic tab synchronization must keep the real Dock visible under an atlas celebration.
let tabDefinition;
const current = { route: 'pages/my/index', data: { nativeRewardItems812: [{ atlas: {} }] } };
vm.runInNewContext(fs.readFileSync('miniprogram/custom-tab-bar/index.js', 'utf8'), {
  Component: (value) => (tabDefinition = value),
  require: () => ({ component: (value) => value }),
  getCurrentPages: () => [current],
  getApp: () => ({ globalData: { unread: 0 } }),
});
const tab = {
  data: { ...tabDefinition.data },
  setData(value) {
    Object.assign(this.data, value);
  },
};
tabDefinition.methods.sync.call(tab, current.route);
assert.equal(
  tab.data.pageOverlayOpen,
  false,
  'Atlas impact stays visible after periodic Dock sync',
);
current.data.nativeRewardItems812 = [{ id: 'ordinary-badge' }];
tabDefinition.methods.sync.call(tab, current.route);
assert.equal(tab.data.pageOverlayOpen, true, 'Ordinary rewards retain existing modal behavior');
current.data.nativeRewardItems812 = [{ atlas: {} }];
current.data.nativeOverlayOpen = true;
tabDefinition.methods.sync.call(tab, current.route);
assert.equal(tab.data.pageOverlayOpen, true, 'Other overlays still hide the Dock');
cp.execFileSync(process.execPath, ['tools/sync-collection-cinema.cjs', '--check']);
(async () => {
  let decode,
    queued = [],
    impact = false,
    rendered = 0,
    images = 0;
  const classes = new Set(),
    canvas = { className: '', setAttribute() {}, remove() {} },
    status = {},
    replay = {};
  const dialog = {
    isConnected: true,
    clientWidth: 390,
    clientHeight: 750,
    dataset: {},
    style: { setProperty() {} },
    prepend() {},
    classList: {
      add: (v) => classes.add(v),
      remove: (...v) => v.forEach((x) => classes.delete(x)),
    },
    querySelector: (s) => (s === '[data-landing-status]' ? status : replay),
  };
  const box = {
    bounds: cinema.bounds,
    render: (_c, _i, a, ids, w, h, _r, ms) => {
      rendered++;
      assert.equal(w, 390);
      assert.equal(h, 750);
      const l = cinema.layout(w, h, a, roof);
      return { layout: l, pose: cinema.pose(ms, l) };
    },
    impactAt: cinema.impactAt,
    duration: cinema.duration,
    Image: class {
      constructor() {
        images++;
      }
      decode() {
        return new Promise((r) => (decode = r));
      }
    },
    document: {
      createElement: () => canvas,
      body: { classList: { add: () => (impact = true), remove: () => (impact = false) } },
    },
    window: { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} },
    navigator: { vibrate() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => (queued.push(fn), queued.length),
    cancelAnimationFrame() {},
  };
  vm.runInNewContext(
    fs
      .readFileSync('dist/shared/atlas-landing.js', 'utf8')
      .replace(/^import .*;\r?\n/gm, '')
      .replace('export function', 'function') + ';this.play=playAtlasLanding',
    box,
  );
  const stop = box.play(dialog, { atlas, buildings: [roof] });
  assert.equal(rendered, 0);
  assert(classes.has('collection-fullscreen814'));
  decode();
  await new Promise(setImmediate);
  queued.shift()(0);
  assert.equal(rendered, 1);
  queued.shift()(cinema.impactAt);
  assert(impact);
  queued.shift()(cinema.duration);
  assert(!impact);
  replay.onclick();
  await new Promise(setImmediate);
  assert.equal(images, 1, 'Replay must not reload the image');
  queued.shift()(0);
  stop();
  assert(!classes.has('collection-fullscreen814'));
  const web = fs.readFileSync('dist/shared/release814.css', 'utf8'),
    native = fs.readFileSync('miniprogram/components/reward-overlay/index.wxml', 'utf8');
  assert.match(web, /100vw/);
  assert.match(web, /100dvh/);
  assert.match(web, /20px 32px/);
  assert.match(web, /overflow:\s*clip/);
  assert.match(native, /cinematic="\{\{true\}\}"/);
  assert(!native.includes('revealed="'), 'Primitive reveal key avoids native Array property loss');
  console.log(
    'PASS v8.1.4: full viewport roof coverage on phone/desktop/landscape, accurate landing, strong impact, image decode gate, close cleanup and identical native/web renderer.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
