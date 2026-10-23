const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { activityView } = require('../miniprogram/services/activity-view');
const topic = {
  phase: 'active',
  points: [{ id: 'a' }, { id: 'b' }],
  visitedPointIds: ['a'],
  startsAt: '2026-10-01',
  endsAt: '2026-11-01',
};
assert.equal(activityView(topic).next.id, 'b');
assert.equal(activityView(topic).progress, 50);
assert.equal(activityView({ ...topic, visitedPointIds: ['a', 'b'] }).complete, true);
assert.equal(activityView({ ...topic, phase: 'ended' }).next, null);
assert.equal(activityView({ ...topic, points: [] }).progress, 0);

// Exercise the actual photo click, close and route cleanup without navigating or opening a tab.
const handlers = {},
  rootClasses = new Set();
let focused = false,
  appended,
  removed = false;
const link = {
  href: 'https://campus.test/media/1234abcd-1234-1234-1234-123456789abc',
  querySelector: () => ({ alt: '我的照片' }),
};
const doc = {
  activeElement: {
    isConnected: true,
    focus: () => {
      focused = true;
    },
  },
  documentElement: {
    classList: { add: (k) => rootClasses.add(k), remove: (k) => rootClasses.delete(k) },
  },
  body: {
    append: (d) => {
      appended = d;
    },
  },
  addEventListener: (name, fn) => {
    handlers[name] = fn;
  },
  createElement: (tag) => ({
    tag,
    children: [],
    events: {},
    setAttribute() {},
    removeAttribute(k) {
      delete this[k];
    },
    append(...x) {
      this.children.push(...x);
    },
    addEventListener(n, f) {
      this.events[n] = f;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
      this.events.close?.();
    },
    remove() {
      removed = true;
    },
    focus() {},
  }),
};
vm.runInNewContext(
  fs.readFileSync('dist/shared/photo-viewer.js', 'utf8').replace('export function', 'function') +
    ';installPhotoViewer();',
  {
    document: doc,
    URL,
    location: { href: 'https://campus.test/#place/a', origin: 'https://campus.test' },
    window: {
      addEventListener: (n, f) => {
        handlers[n] = f;
      },
    },
  },
);
let prevented = false;
const event = {
  button: 0,
  target: { closest: () => link },
  preventDefault() {
    prevented = true;
  },
};
handlers.click(event);
assert(prevented && appended.open);
assert.equal(appended.children[1].src, link.href);
assert(rootClasses.has('photo-viewing73'));
appended.children[0].onclick();
assert(removed && focused && !rootClasses.size);
removed = false;
handlers.click({ ...event, defaultPrevented: false });
handlers.hashchange();
assert(removed && !rootClasses.size);
prevented = false;
link.href = 'https://other.test/photo.jpg';
handlers.click(event);
assert(!prevented);
console.log('PASS v7.3 real activity progress and in-page photo preview, focus and route cleanup.');
