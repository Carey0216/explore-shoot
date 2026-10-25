const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const handlers = {},
  scroll = [],
  root = new Set();
let restored = false;
function element(tag) {
  return {
    tag,
    style: {},
    children: [],
    events: {},
    setAttribute() {},
    removeAttribute() {},
    append(...items) {
      this.children.push(...items);
    },
    addEventListener(k, f) {
      this.events[k] = f;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
      this.events.close?.();
    },
    remove() {},
    focus() {},
    setPointerCapture() {},
  };
}
const context = {
  URL,
  Map,
  Math,
  Set,
  scrollX: 0,
  scrollY: 580,
  document: {
    activeElement: {
      isConnected: true,
      focus() {
        restored = true;
      },
    },
    createElement: element,
    body: { append() {} },
    documentElement: { classList: { add: (k) => root.add(k), remove: (k) => root.delete(k) } },
    addEventListener(k, f) {
      handlers[k] = f;
    },
  },
  window: {
    scrollTo: (x, y) => scroll.push([x, y]),
    addEventListener(k, f) {
      handlers[k] = f;
    },
  },
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync('dist/shared/photo-viewer.js', 'utf8').replace(/export /g, ''),
  context,
);
const d = context.openPhotoViewer(['/media/one', '/media/two'], 0),
  stage = d.children[0],
  image = stage.children[0];
assert.equal(d.children[2].textContent, '1 / 2');
d.onkeydown({ key: 'ArrowRight', preventDefault() {} });
assert.equal(image.src, '/media/two');
assert.equal(d.children[2].textContent, '2 / 2');
stage.ondblclick();
stage.onpointerdown({ pointerId: 1, clientX: 50, clientY: 50 });
stage.onpointermove({ pointerId: 1, clientX: 50, clientY: 180 });
stage.onpointerup({ pointerId: 1, clientX: 50, clientY: 180 });
assert(d.open, 'Zoomed photo must pan without closing');
stage.ondblclick();
stage.onpointerdown({ pointerId: 1, clientX: 50, clientY: 50 });
stage.onpointerup({ pointerId: 1, clientX: 50, clientY: 180 });
assert(!d.open);
assert(restored);
assert.deepEqual(scroll.at(-1), [0, 580]);
assert(!root.size);
const pageModule = { exports: {} },
  bindings = {
    features: { snapshot: () => ({}), methods: {} },
    appearance: { snapshot: () => ({}) },
    localization: { page: (d) => d },
  };
const pageContext = {
  module: pageModule,
  require: (p) => bindings[p.replace('./', '')],
  getApp: () => ({ globalData: {} }),
  wx: {},
};
vm.runInNewContext(fs.readFileSync('miniprogram/services/page.js', 'utf8'), pageContext);
const definition = pageModule.exports.pageOptions({ data: {} }),
  bar = {
    setData(v) {
      Object.assign(this, v);
    },
  },
  page = {
    ...definition,
    nativeVisible: true,
    data: { ...definition.data },
    setData(v) {
      Object.assign(this.data, v);
    },
    getTabBar: () => bar,
  };
page.nativeOverlay({ detail: { open: true } });
assert(bar.pageOverlayOpen);
page.publicOverlay({ detail: { open: true } });
page.nativeOverlay({ detail: { open: false } });
assert(bar.pageOverlayOpen, 'Another visible overlay still owns the Dock');
page.publicOverlay({ detail: { open: false } });
assert.equal(bar.pageOverlayOpen, false);
console.log(
  'PASS v8.1 viewer navigation/pan/swipe-close/focus/scroll and native overlapping-overlay Dock restoration.',
);
