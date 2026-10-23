const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
(async () => {
  const source = fs
    .readFileSync('dist/shared/campus-time.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const web = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const mini = require('../miniprogram/services/campus-time');
  for (const [hour, minute, expected] of [
    [0, 0, 'evening'],
    [6, 59, 'evening'],
    [7, 0, 'day'],
    [17, 59, 'day'],
    [18, 0, 'evening'],
    [23, 59, 'evening'],
  ]) {
    const date = new Date(2026, 9, 23, hour, minute);
    for (const module of [web, mini]) {
      assert.equal(module.campusPeriod('auto', date), expected);
      assert.equal(module.campusPeriod('day', date), 'day');
      assert.equal(module.campusPeriod('evening', date), 'evening');
      assert.equal(module.campusPeriod('evening', date, false), 'day');
    }
  }
  const panoramaSource = fs
    .readFileSync('dist/shared/campus-panorama.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const { panoramaFaces } = await import(
    'data:text/javascript;base64,' + Buffer.from(panoramaSource).toString('base64')
  );
  const m = JSON.parse(fs.readFileSync('dist/shared/panorama/manifest.json'));
  assert.equal(panoramaFaces(m, 'evening').length, 6);
  assert.ok(panoramaFaces(m, 'evening').every((p) => p.startsWith('/shared/panorama/evening/')));
  for (const face of m.evening.faces) {
    const bytes = fs.readFileSync('dist/shared/panorama/evening/' + face.file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), face.sha256);
    assert.equal(bytes.length, face.bytes);
  }
  assert.throws(() => panoramaFaces({ ...m, evening: { ...m.evening, faces: [] } }, 'evening'));
  // Retained viewers update without changing saved preferences and release observers when closed.
  let preference = { campusTime: 'day' },
    enabled = true,
    visible = true,
    subscriber;
  const events = new Map(),
    timers = new Set(),
    control = {},
    select = { addEventListener() {}, removeEventListener() {} },
    label = {},
    phases = [];
  const context = {
    getPreferences: () => preference,
    subscribePreferences: (fn) => {
      subscriber = fn;
      return () => {
        subscriber = null;
      };
    },
    featureOn: () => enabled,
    featureVisible: () => visible,
    setInterval: (fn) => {
      timers.add(fn);
      return fn;
    },
    clearInterval: (fn) => timers.delete(fn),
    window: {
      addEventListener: (k, v) => events.set(k, v),
      removeEventListener: (k) => events.delete(k),
    },
    document: {
      addEventListener: (k, v) => events.set(k, v),
      removeEventListener: (k) => events.delete(k),
    },
  };
  require('node:vm').runInNewContext(
    source.replace(/export /g, '') + '\nthis.watch = watchCampusTime;',
    context,
  );
  const stop = context.watch(
    {
      querySelector: (s) =>
        s === '.campus-time-control' ? control : s === '[data-campus-time]' ? select : label,
    },
    (p) => phases.push(p),
  );
  preference = { campusTime: 'evening' };
  subscriber();
  enabled = false;
  visible = false;
  events.get('features:change')();
  assert.deepEqual(phases, ['day', 'evening', 'day']);
  assert.equal(control.hidden, true);
  assert.equal(preference.campusTime, 'evening');
  stop();
  assert.equal(timers.size, 0);
  assert.equal(events.size, 0);
  assert.equal(subscriber, null);
  console.log(
    'PASS device-local 07:00/18:00 boundaries, manual/disabled modes, cross-client parity and evening asset integrity',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
