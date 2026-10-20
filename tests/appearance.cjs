const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('dist/shared/appearance.js', 'utf8');
function browser({ dark = false, saved = null, blocked = false, reduce = false } = {}) {
  const changes = {},
    events = {},
    storage = new Map(),
    classes = new Set();
  if (saved) storage.set('explore-appearance-v1', JSON.stringify(saved));
  const root = {
    dataset: {},
    style: {},
    classList: { add: (v) => classes.add(v), remove: (v) => classes.delete(v) },
  };
  const media = {
    dark: { matches: dark, addEventListener: (_, fn) => (changes.dark = fn) },
    reduce: { matches: reduce, addEventListener: (_, fn) => (changes.reduce = fn) },
  };
  let themeColor;
  const context = {
    window: {
      matchMedia: (q) => (q.includes('color-scheme') ? media.dark : media.reduce),
      addEventListener: (type, fn) => (events[type] = fn),
    },
    document: {
      documentElement: root,
      querySelector: () => ({ setAttribute: (_, v) => (themeColor = v) }),
      addEventListener: (type, fn) => (events[type] = fn),
    },
    localStorage: {
      getItem: (key) => {
        if (blocked) throw Error('blocked');
        return storage.get(key) || null;
      },
      setItem: (key, value) => {
        if (blocked) throw Error('blocked');
        storage.set(key, value);
      },
    },
    setTimeout: (fn) => {
      events.timer = fn;
      return 1;
    },
    clearTimeout: () => {},
  };
  vm.runInNewContext(source, context);
  return {
    root,
    media,
    changes,
    events,
    classes,
    storage,
    set: context.window.campusAppearance.set,
    color: () => themeColor,
  };
}
let b = browser({ dark: true });
assert.equal(
  b.root.dataset.appearance,
  'dark',
  'First paint follows system without a saved override',
);
assert(!b.classes.has('appearance-changing'), 'Initial paint does not animate');
b.events.DOMContentLoaded();
b.set('light');
assert.equal(b.root.dataset.appearance, 'light');
assert.equal(b.color(), '#f5f7f5');
assert(b.classes.has('appearance-changing'));
b.events.timer();
assert(!b.classes.has('appearance-changing'));
b.media.dark.matches = false;
b.changes.dark();
b.media.dark.matches = true;
b.changes.dark();
assert.equal(b.root.dataset.appearance, 'light', 'Manual override survives OS changes');
b.set('system');
assert.equal(b.root.dataset.appearance, 'dark');
b.media.dark.matches = false;
b.changes.dark();
assert.equal(b.root.dataset.appearance, 'light');
b.set('dark', 'reduce');
assert(!b.classes.has('appearance-changing'));
b.events.storage({
  key: 'explore-appearance-v1',
  newValue: JSON.stringify({ appearance: 'light' }),
});
assert.equal(b.root.dataset.appearance, 'light');
assert.equal(browser({ dark: true, blocked: true }).root.dataset.appearance, 'dark');
assert.equal(
  browser({ dark: true, saved: { appearance: 'light' } }).root.dataset.appearance,
  'light',
);
b = browser({ reduce: true });
b.events.DOMContentLoaded();
b.set('dark');
assert(!b.classes.has('appearance-changing'));
console.log(
  'PASS appearance: pre-paint system default, live OS change, persistent manual override, cross-tab sync, blocked storage and reduced-motion transitions.',
);
