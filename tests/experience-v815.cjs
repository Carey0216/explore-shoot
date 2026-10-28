const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const cinema = require('../miniprogram/services/collection-cinema');
const atlas = {
  photoWidth: 1200,
  photoHeight: 3000,
  planWidth: 1300,
  planHeight: 700,
  buildings: [
    {
      id: 'photo:roof',
      frame: 'photo',
      collected: true,
      outline: [
        [500, 1400],
        [560, 1400],
        [560, 1430],
        [500, 1430],
      ],
      holes: [],
    },
  ],
};
function surface() {
  let width = 0,
    height = 0,
    resizes = 0,
    clears = 0;
  const copies = [],
    stack = [];
  const context = new Proxy(
    {
      globalCompositeOperation: 'source-over',
      save() {
        stack.push(this.globalCompositeOperation);
      },
      restore() {
        this.globalCompositeOperation = stack.pop();
      },
      clearRect() {
        clears++;
      },
      drawImage(source) {
        copies.push({ source, mode: this.globalCompositeOperation });
        if (canvas.rejectCopy && this.globalCompositeOperation === 'copy')
          throw Error('Legacy surface');
      },
      getImageData() {
        return { data: new Uint8ClampedArray(width * height * 4), width, height };
      },
    },
    { get: (o, k) => (k in o ? o[k] : () => {}) },
  );
  const canvas = {
    get width() {
      return width;
    },
    set width(v) {
      width = v;
      resizes++;
    },
    get height() {
      return height;
    },
    set height(v) {
      height = v;
      resizes++;
    },
    getContext: () => context,
    copies,
    get clears() {
      return clears;
    },
    get resizes() {
      return resizes;
    },
    context,
  };
  return canvas;
}
const visible = surface(),
  map = surface(),
  frame = surface(),
  photo = {},
  cache = { surface: map, frameSurface: frame };
for (const ms of [0, 400, 1200, 1300, 1600, 2400, 0])
  cinema.render(visible, photo, atlas, ['photo:roof'], 390, 750, 2, ms, cache);
assert.equal(visible.clears, 0, 'A visible frame is never cleared before the next frame is ready');
assert.equal(visible.copies.length, 7);
assert(visible.copies.every((c) => c.source === frame && c.mode === 'copy'));
assert.equal(visible.resizes, 2, 'Replay/impact must not resize the visible backing store');
assert.equal(visible.context.globalCompositeOperation, 'source-over');
visible.rejectCopy = true;
assert.doesNotThrow(() =>
  cinema.render(visible, photo, atlas, ['photo:roof'], 390, 750, 2, 100, cache),
);
assert(cache.atomicUnavailable);
assert.equal(
  visible.context.globalCompositeOperation,
  'source-over',
  'Legacy fallback restores compositing before painting',
);

const css = fs.readFileSync('dist/shared/release815.css', 'utf8');
assert.match(css, /#main\s*\{[^}]*isolation:\s*isolate/s);
assert.match(css, /#mobile-nav\s*\{[^}]*z-index:\s*8000/s);
assert.match(css, /visibility:\s*hidden/);
assert.match(css, /backdrop-filter:\s*none/);
function element(top = 100) {
  const classes = new Set(),
    properties = new Map();
  return {
    classes,
    classList: {
      add: (...v) => v.forEach((c) => classes.add(c)),
      remove: (...v) => v.forEach((c) => classes.delete(c)),
    },
    style: {
      setProperty: (k, v) => properties.set(k, v),
      removeProperty: (k) => properties.delete(k),
      getPropertyValue: (k) => properties.get(k) || '',
    },
    getBoundingClientRect: () => ({
      left: 0,
      right: 100,
      top,
      bottom: top + 40,
      width: 100,
      height: 40,
    }),
  };
}
const root = element(),
  body = element(),
  main = element(),
  topbar = element(),
  dock = element(),
  heading = element(),
  close = element();
const controls = [...Array.from({ length: 50 }, () => element()), element(900)];
root.style.setProperty('--collection-ground815', 'original');
const document = {
  documentElement: root,
  body,
  querySelectorAll: (s) =>
    s.startsWith('#topbar') ? [topbar, dock] : s.includes('#main button') ? controls : [],
};
const motionBox = {
  document,
  window: { innerWidth: 390, innerHeight: 750 },
  getComputedStyle: () => ({ backgroundColor: 'rgb(240, 245, 242)' }),
  setTimeout: () => 1,
  clearTimeout() {},
};
vm.runInNewContext(
  fs
    .readFileSync('dist/shared/collection-impact.js', 'utf8')
    .replace('export function', 'function') + ';this.install=collectionImpact',
  motionBox,
);
const motion = motionBox.install({
  querySelector: (s) => (s.endsWith('button') ? close : heading),
});
motion.play();
assert(body.classes.has('collection-impact815'));
assert(!main.classes.size, 'The scrolling/fixed-panel containing block is never transformed');
assert(dock.classes.has('collection-world815'));
assert(!controls.at(-1).classes.size, 'Offscreen controls do not allocate animation layers');
assert([topbar, dock, heading, close, ...controls].filter((e) => e.classes.size).length <= 36);
motion.clear();
assert([topbar, dock, heading, close, ...controls].every((e) => !e.classes.size));
motion.dispose();
assert.equal(root.style.getPropertyValue('--collection-ground815'), 'original');
assert(!root.classes.has('collection-scene815'));

(async () => {
  let decode,
    imageCount = 0,
    count = 0,
    disposed = false,
    renderable = true;
  const callbacks = new Map(),
    handlers = {},
    props = new Map(),
    classes = new Set(),
    status = {},
    replay = {};
  const dialog = {
    clientWidth: 390,
    clientHeight: 750,
    isConnected: true,
    dataset: {},
    style: { setProperty: (k, v) => props.set(k, v) },
    classList: {
      add: (k) => classes.add(k),
      remove: (...v) => v.forEach((k) => classes.delete(k)),
    },
    prepend() {},
    querySelector: (s) => (s === '[data-landing-status]' ? status : replay),
  };
  const viewport = {
    innerWidth: 390,
    innerHeight: 750,
    visualViewport: { height: 750 },
    devicePixelRatio: 2,
    addEventListener: (k, fn) => (handlers[k] = fn),
    removeEventListener: (k) => delete handlers[k],
  };
  const box = {
    bounds: cinema.bounds,
    impactAt: cinema.impactAt,
    duration: cinema.duration,
    collectionImpact: () => ({
      clear() {},
      play() {},
      dispose() {
        disposed = true;
      },
    }),
    render: () =>
      renderable ? { layout: { map: { y: 200, height: 200 } }, pose: { scale: 1 } } : null,
    window: viewport,
    document: { createElement: () => ({ setAttribute() {}, remove() {} }) },
    navigator: {
      vibrate() {
        throw Error('Haptics unavailable');
      },
    },
    performance: { now: () => 0 },
    Image: class {
      constructor() {
        imageCount++;
      }
      decode() {
        return new Promise((r) => (decode = r));
      }
    },
    requestAnimationFrame: (fn) => {
      callbacks.set(++count, fn);
      return count;
    },
    cancelAnimationFrame: (id) => callbacks.delete(id),
  };
  vm.runInNewContext(
    fs
      .readFileSync('dist/shared/atlas-landing.js', 'utf8')
      .replace(/^import .*;\r?\n/gm, '')
      .replace('export function', 'function') + ';this.play=playAtlasLanding',
    box,
  );
  const stop = box.play(dialog, { atlas, buildings: atlas.buildings });
  decode();
  await new Promise(setImmediate);
  const run = (ms) => {
    const [id, fn] = callbacks.entries().next().value;
    callbacks.delete(id);
    fn(ms);
  };
  run(0);
  viewport.visualViewport.height = 700;
  handlers.resize();
  assert.equal(
    props.get('--collection-window-height'),
    '750px',
    'Safari toolbar changes do not rebuild the scene',
  );
  viewport.innerWidth = 844;
  viewport.visualViewport.height = 390;
  handlers.resize();
  assert.equal(
    props.get('--collection-window-width'),
    '844px',
    'Real orientation changes still adapt',
  );
  viewport.innerWidth = 1440;
  viewport.visualViewport.height = 900;
  box.document.querySelector = () => ({
    getBoundingClientRect: () => ({ left: 480, width: 480 }),
  });
  handlers.resize();
  viewport.visualViewport.height = 850;
  handlers.resize();
  assert.equal(
    props.get('--collection-window-height'),
    '850px',
    'A desktop phone preview adapts even when the app is only 480px wide',
  );
  run(1500);
  assert(classes.has('collection-landed814'), 'Haptic errors cannot stop visible completion');
  replay.onclick();
  await new Promise(setImmediate);
  assert.equal(imageCount, 1, 'Replay does not request/decode the image again');
  renderable = false;
  run(1);
  assert.match(status.textContent, /重试/);
  assert(classes.has('collection-landed814'));
  stop();
  assert(disposed);
  assert(!handlers.resize);
  assert(!callbacks.size);
  console.log(
    'PASS v8.1.5: atomic canvas presentation, replay/toolbar stability, safe fallback, visible-only motion, Dock containment and cleanup.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
