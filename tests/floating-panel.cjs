const assert = require('node:assert/strict');
const fs = require('node:fs');
const events = new Map(),
  windowEvents = new Map();
let focused = 0,
  cleaned = 0,
  removed = 0;
const anchor = {
  isConnected: true,
  getBoundingClientRect: () => ({ left: 370, top: 650, bottom: 690, width: 40, height: 40 }),
  setAttribute() {},
  removeAttribute() {},
  focus() {
    focused++;
  },
};
const panel = {
  style: {},
  offsetWidth: 312,
  offsetHeight: 180,
  setAttribute() {},
  contains: (target) => target === 'inside',
  querySelector: () => ({ focus() {} }),
  remove() {
    removed++;
  },
};
global.document = {
  activeElement: anchor,
  createElement: () => panel,
  body: { append() {} },
  addEventListener: (name, fn) => events.set(name, fn),
  removeEventListener: (name) => events.delete(name),
};
global.window = {
  addEventListener: (name, fn) => windowEvents.set(name, fn),
  removeEventListener: (name) => windowEvents.delete(name),
};
global.innerWidth = 390;
global.innerHeight = 700;
(async () => {
  const source = fs
    .readFileSync('dist/shared/floating-panel.js', 'utf8')
    .replace(/^import.*;\r?\n/, 'const esc=String;\n');
  const { floatingPanel } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  let popup = floatingPanel({ title: 'Confirm', body: '', mount: () => () => cleaned++ });
  assert.equal(panel.style.left, '66px', 'The card stays inside a narrow viewport');
  assert(Number.parseFloat(panel.style.top) + panel.offsetHeight <= 688);
  events.get('pointerdown')({ target: 'inside' });
  assert.equal(removed, 0);
  events.get('pointerdown')({ target: 'outside' });
  assert.equal(removed, 1);
  assert.equal(cleaned, 1);
  assert.equal(events.size, 0);
  assert.equal(windowEvents.size, 0);
  popup = floatingPanel({ title: 'Confirm', body: '' });
  let stopped = false;
  events.get('keydown')({
    key: 'Escape',
    preventDefault() {},
    stopPropagation() {
      stopped = true;
    },
  });
  assert(stopped);
  assert.equal(focused, 1);
  floatingPanel({ title: 'Plan', body: '', mount: () => () => cleaned++ });
  windowEvents.get('hashchange')();
  assert.equal(cleaned, 2);
  console.log(
    'PASS floating cards: outside dismiss, inside interaction, Escape focus recovery, viewport containment and route cleanup.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
