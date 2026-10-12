const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const original = {
    now: Date.now,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    document: global.document,
    window: global.window,
  };
  let now = 1700000000000,
    seq = 0;
  const timers = new Map(),
    events = new Map(),
    pageEvents = new Map();
  Date.now = () => now;
  global.setInterval = (fn, ms) => {
    timers.set(++seq, { fn, ms, next: now + ms });
    return seq;
  };
  global.clearInterval = (id) => timers.delete(id);
  const listenerAPI = (map) => ({
    addEventListener(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
    },
    removeEventListener(name, fn) {
      map.get(name)?.delete(fn);
    },
  });
  global.document = { hidden: false, ...listenerAPI(events) };
  global.window = listenerAPI(pageEvents);
  const advance = (ms) => {
    const end = now + ms;
    while (true) {
      const next = [...timers.values()].sort((a, b) => a.next - b.next)[0];
      if (!next || next.next > end) break;
      now = next.next;
      next.next += next.ms;
      next.fn();
    }
    now = end;
  };
  const active = new Map(),
    all = [],
    probes = [],
    clears = [];
  const sensor = {
    watchPosition(cb, err, options) {
      assert.equal(options.enableHighAccuracy, true);
      assert.equal(options.maximumAge, 0);
      const id = all.length + 1;
      const call = { id, cb, err, options };
      active.set(id, call);
      all.push(call);
      return id;
    },
    clearWatch(id) {
      clears.push(id);
      active.delete(id);
    },
    getCurrentPosition(cb, err, options) {
      assert.equal(options.enableHighAccuracy, true);
      assert.equal(options.maximumAge, 0);
      probes.push({ cb, err, options });
    },
  };
  const fix = (lng = 106.09, timestamp = now, accuracy = 8) => ({
    coords: { longitude: lng, latitude: 38.49, accuracy },
    timestamp,
  });
  try {
    const { freshBrowserLocation } = await import(
      'data:text/javascript;base64,' +
        Buffer.from(fs.readFileSync('dist/shared/fresh-location.js')).toString('base64')
    );
    const geo = freshBrowserLocation(sensor),
      received = [],
      errors = [],
      statuses = [];
    // Outside-campus cached position must not be relabelled as a current position.
    geo.getCurrentPosition(
      (p) => received.push(p),
      (e) => errors.push(e),
      { maximumAge: 10000 },
    );
    const old = all.at(-1);
    old.cb(fix(106.2, now - 60000));
    probes.at(-1).cb(fix(106.2, now - 60000));
    assert.equal(received.length, 0);
    advance(1000);
    old.cb(fix());
    assert.equal(received.length, 1);
    assert.equal(received[0].timestamp, now);
    assert.equal(received[0].coords.longitude, 106.09);
    assert.equal(active.size, 0);
    assert.equal(timers.size, 0);
    old.cb(fix(106.2));
    assert.equal(received.length, 1, 'Late results after completion are ignored');
    // Retry in the same page starts new sensors and cannot be replaced by an older request.
    const cancel = geo.getCurrentPosition(
      (p) => received.push(p),
      (e) => errors.push(e),
    );
    const cancelled = all.at(-1);
    cancel();
    cancelled.cb(fix(106.2));
    assert.equal(received.length, 1);
    geo.getCurrentPosition(
      (p) => received.push(p),
      (e) => errors.push(e),
    );
    const precise = all.at(-1);
    precise.cb(fix(106.2, now, 150));
    assert.equal(received.length, 1);
    advance(1000);
    precise.cb(fix());
    assert.equal(received.length, 2);
    const id = geo.watchPosition(
      (p) => received.push(p),
      (e) => errors.push(e),
      { onStatus: (s) => statuses.push(s) },
    );
    const watch = all.at(-1);
    advance(1000);
    watch.cb(fix());
    const delivered = received.length;
    watch.cb(fix(106.2, now - 60000));
    watch.cb(fix(106.2, now + 60000));
    watch.cb(fix(181));
    watch.cb(fix(106.2, now, 1000));
    assert.equal(
      received.length,
      delivered,
      'Invalid, expired, future, duplicate and imprecise fixes are rejected',
    );
    // No movement does not mean stuck: newer timestamp at the same coordinate is valid.
    advance(1000);
    watch.cb(fix());
    assert.equal(received.length, delivered + 1);
    advance(10000);
    assert.match(statuses.at(-1), /重新获取/);
    assert(clears.includes(watch.id));
    assert.equal(active.size, 1, 'Quiet sensor is replaced, not multiplied');
    const beforeLate = received.length;
    watch.cb(fix(106.2));
    assert.equal(
      received.length,
      beforeLate,
      'Replaced sensor callbacks cannot overwrite recovery',
    );
    const probe = probes.at(-1);
    advance(1000);
    probe.cb(fix(106.091));
    assert.equal(
      received.at(-1).coords.longitude,
      106.091,
      'Recovery resumes without refreshing the page',
    );
    const stale = all.at(-1);
    freshBrowserLocation(sensor).clearWatch(id);
    assert.equal(active.size, 0);
    assert.equal(timers.size, 0);
    const count = received.length;
    stale.cb(fix());
    probe.cb(fix());
    assert.equal(received.length, count);
    // Recovery is bounded; permission denial never falls through to another location source.
    geo.watchPosition(
      (p) => received.push(p),
      (e) => errors.push(e),
    );
    const denied = all.at(-1);
    denied.err({ code: 1 });
    assert.equal(errors.at(-1).code, 1);
    assert.equal(active.size, 0);
    assert.equal(timers.size, 0);
    geo.watchPosition(
      (p) => received.push(p),
      (e) => errors.push(e),
    );
    advance(20000);
    assert.equal(errors.at(-1).freshness, true);
    assert.match(errors.at(-1).message, /新的精确位置/);
    assert.equal(active.size, 0);
    geo.watchPosition(
      (p) => received.push(p),
      (e) => errors.push(e),
    );
    advance(1000);
    all.at(-1).cb(fix());
    advance(30000);
    assert.match(errors.at(-1).message, /长时间未更新/);
    assert.equal(active.size, 0);
    assert.equal(timers.size, 0);
    geo.getCurrentPosition(
      () => {},
      (e) => errors.push(e),
    );
    document.hidden = true;
    for (const fn of [...events.get('visibilitychange')]) fn();
    assert.match(errors.at(-1).message, /后台/);
    assert.equal(active.size, 0);
    document.hidden = false;
    assert.equal(active.size, 0, 'Return does not silently restart permission/sensors');
    const autoCancel = geo.getCurrentPosition(
      () => {},
      () => {},
    );
    for (const fn of [...pageEvents.get('pagehide')]) fn();
    assert.equal(active.size, 0);
    autoCancel();
    assert.equal(timers.size, 0);
    assert.equal(events.get('visibilitychange').size, 0);
    assert.equal(pageEvents.get('pagehide').size, 0);
    // Router selects timestamp-preserving WGS84 browser acquisition before SDK loading.
    global.__freshRouter = {
      freshBrowserLocation,
      fromTencent: () => {
        throw Error('Native WGS84 must not be converted as GCJ02');
      },
      alternativeLocation: () => ({ alternate: true }),
    };
    const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { geolocation: sensor },
    });
    try {
      const source = fs
        .readFileSync('dist/shared/tencent-location.js', 'utf8')
        .replace(/^import [\s\S]*?;\r?\n/gm, '');
      const router = await import(
        'data:text/javascript;base64,' +
          Buffer.from(
            'const {freshBrowserLocation,fromTencent,alternativeLocation}=globalThis.__freshRouter;\n' +
              source,
          ).toString('base64')
      );
      router.locationFor({ map: { tencentKey: 'TEST' } }).getCurrentPosition(
        (p) => received.push(p),
        (e) => errors.push(e),
      );
      advance(1000);
      all.at(-1).cb(fix());
      assert.equal(received.at(-1).coords.longitude, 106.09);
      assert.equal(router.locationFor({ map: { provider: 'amap' } }).alternate, true);
    } finally {
      if (originalNavigator) Object.defineProperty(global, 'navigator', originalNavigator);
      else delete global.navigator;
      delete global.__freshRouter;
    }
  } finally {
    Date.now = original.now;
    global.setInterval = original.setInterval;
    global.clearInterval = original.clearInterval;
    global.document = original.document;
    global.window = original.window;
  }
  console.log(
    'PASS: fresh sensor timestamps, outside-to-inside retry without reload, high accuracy/no cache, stale/future/duplicate rejection, stationary fixes, bounded watchdog recovery, denial, cancellation/background disposal and WGS84 routing.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
