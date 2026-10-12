const assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs');
const source = fs.readFileSync('dist/user/startup.js', 'utf8');
function open(pref) {
  const timers = new Map(),
    elements = {};
  let id = 0,
    reloads = 0;
  function element() {
    const classes = new Set();
    return {
      classList: {
        add: (v) => classes.add(v),
        remove: (v) => classes.delete(v),
        contains: (v) => classes.has(v),
      },
      textContent: '',
      hidden: true,
      setAttribute(k, v) {
        this[k] = v;
      },
      addEventListener(k, v) {
        this[k] = v;
      },
      remove() {
        this.removed = true;
      },
    };
  }
  for (const name of ['startup', 'startup-status', 'startup-retry']) elements[name] = element();
  const body = element();
  body.classList.add('app-starting');
  elements.startup.querySelector = (name) => elements[name] || (elements[name] = element());
  const context = {
    window: {},
    document: { body, documentElement: { dataset: {} }, getElementById: (id) => elements[id] },
    localStorage: { getItem: () => JSON.stringify(pref) },
    location: { reload: () => reloads++ },
    setTimeout: (fn, ms) => {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(source, context);
  const tick = (ms) => {
    for (const [id, t] of [...timers])
      if (t.ms === ms) {
        timers.delete(id);
        t.fn();
      }
  };
  return {
    elements,
    body,
    timers,
    tick,
    html: context.document.documentElement,
    api: context.window.campusStartup,
    reloads: () => reloads,
  };
}
let app = open();
assert(app.body.classList.contains('app-starting'));
app.api.ready();
assert(!app.body.classList.contains('app-starting'));
assert.equal(app.elements.startup['aria-hidden'], 'true');
assert(app.elements.startup.inert);
assert.deepEqual(
  [...app.timers.values()].map((t) => t.ms),
  [260],
);
app.tick(260);
assert(app.elements.startup.removed);
app = open();
app.tick(4500);
assert(app.elements['startup-status'].textContent.includes('慢'));
app.tick(15000);
assert.equal(app.elements['startup-retry'].hidden, false);
assert(app.body.classList.contains('app-starting'));
app.elements['startup-retry'].click();
assert.equal(app.reloads(), 1);
app.api.ready();
assert(!app.body.classList.contains('app-starting'));
app = open();
app.api.fail('网络中断');
assert.equal(app.elements['startup-status'].textContent, '网络中断');
assert.equal(app.timers.size, 0);
app.api.ready();
app.api.fail('迟到错误');
assert.equal(app.elements['startup-status'].textContent, '网络中断');
for (const language of ['zh-TW', 'ja', 'en']) {
  app = open({ language, motion: 'reduce' });
  assert.equal(app.html.dataset.motion, 'reduce');
  assert.notEqual(app.elements['startup-status'].textContent, '准备好，一起出发。');
  app.tick(15000);
  assert.notEqual(
    app.elements['startup-status'].textContent,
    '暂时没能打开校园，请检查网络后重试。',
  );
  app.api.configure({ language: 'zh-CN', motion: 'system' });
  assert.equal(app.elements['startup-status'].textContent, '暂时没能打开校园，请检查网络后重试。');
}
console.log(
  'PASS: startup immediate readiness, slow network, missing modules timeout, retry, late recovery and cleared timers.',
);
