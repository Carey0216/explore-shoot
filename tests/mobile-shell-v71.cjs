const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
function device({ width, height, coarse = false, mobile = false }) {
  const classes = new Set(),
    events = {},
    storage = new Map(),
    children = [];
  let gate;
  const classList = {
    contains: (k) => classes.has(k),
    toggle: (k, on) => (on ? classes.add(k) : classes.delete(k)),
  };
  const body = {
    children,
    append(el) {
      children.push(el);
      gate = el;
    },
  };
  const surface = {
    tagName: 'DIV',
    inert: false,
    dataset: {},
    hasAttribute(k) {
      return k === 'inert' && this.inert;
    },
  };
  children.push(surface);
  const context = {
    innerWidth: width,
    innerHeight: height,
    navigator: { maxTouchPoints: coarse ? 5 : 0, userAgent: mobile ? 'Android Mobile' : 'Desktop' },
    matchMedia: () => ({ matches: coarse }),
    screen: { orientation: { addEventListener() {} } },
    sessionStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    CustomEvent: function (t, v) {
      this.type = t;
      this.detail = v.detail;
    },
    document: {
      body,
      documentElement: { classList },
      getElementById: () => gate,
      querySelectorAll: () => [],
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          inert: false,
          dataset: {},
          hasAttribute() {
            return false;
          },
          setAttribute() {},
          addEventListener() {},
          querySelector() {
            return this.innerHTML.includes('mobile-preview-continue')
              ? { addEventListener: (_, f) => (this.continue = f) }
              : null;
          },
          showModal() {
            this.open = true;
          },
          close() {
            this.open = false;
          },
        };
      },
    },
    window: { addEventListener: (k, f) => (events[k] = f), dispatchEvent() {} },
  };
  vm.runInNewContext(fs.readFileSync('dist/user/mobile-viewport.js', 'utf8'), context);
  return {
    context,
    classes,
    surface,
    get gate() {
      return gate;
    },
    resize(w, h) {
      context.innerWidth = w;
      context.innerHeight = h;
      events.resize();
    },
  };
}
let desktop = device({ width: 1440, height: 900 });
assert(desktop.gate.open);
assert(desktop.surface.inert);
assert(desktop.gate.innerHTML.includes('继续在本机以移动端页面查看'));
desktop.gate.continue();
assert(!desktop.gate.open);
assert(!desktop.surface.inert);
assert(desktop.classes.has('mobile-preview'));
for (const [w, h] of [
  [390, 844],
  [820, 1180],
  [720, 960],
  [1024, 1366],
]) {
  const d = device({ width: w, height: h, coarse: true, mobile: true });
  assert(!d.gate?.open);
  d.resize(h, w);
  assert(d.gate.open);
  assert(!d.gate.innerHTML.includes('<button'));
  d.resize(w, h);
  assert(!d.gate.open);
  assert(!d.surface.inert);
}
const keyboard = device({ width: 390, height: 844, coarse: true, mobile: true });
keyboard.context.screen.orientation.type = 'portrait-primary';
keyboard.resize(390, 280);
assert(!keyboard.gate?.open, 'A portrait keyboard must not be mistaken for phone rotation');
assert(!device({ width: 430, height: 850 }).gate?.open);
(async () => {
  const mod = await import(
    'data:text/javascript;base64,' +
      Buffer.from(fs.readFileSync('dist/shared/badge-presets.js', 'utf8')).toString('base64')
  );
  assert.equal(mod.badgePresets.length, 50);
  assert.equal(new Set(mod.badgePresets.map((p) => p.id)).size, 50);
  for (const p of mod.badgePresets) {
    assert(fs.statSync('dist' + mod.badgeURL(p.id)).size > 1000);
    const svg = fs.readFileSync('dist/shared/badges/' + p.id + '.svg', 'utf8');
    assert(!/<script|https?:\/\/(?!www.w3.org)|onload=/i.test(svg));
  }
  const Jimp = require('jimp');
  const badge = await Jimp.read('dist/shared/badges/badge-01.png');
  assert.equal(badge.bitmap.data[3], 0, 'medal corners must be transparent');
  const art = await import(
    'data:text/javascript;base64,' +
      Buffer.from(fs.readFileSync('dist/shared/passport-card-art.js', 'utf8')).toString('base64')
  );
  assert.equal(art.cardStyles.length, 11);
  console.log(
    'PASS v7.1 desktop opt-in, portrait/foldable and landscape transitions, inert restoration, 50 transparent medals and 11 card styles.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
