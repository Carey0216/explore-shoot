const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs
  .readFileSync('dist/user/photo-timing.js', 'utf8')
  .replace(/^import[\s\S]*?;\r?\n/gm, '')
  .replace(/export /g, '');
const weather = {
  available: true,
  code: 1,
  label: '银川 · 西夏区',
  temperature: 10,
  high: 14,
  low: 5,
};
async function web(action) {
  const events = {},
    docEvents = {},
    timers = [],
    bubble = { style: {}, dataset: {}, setAttribute() {}, hidden: true },
    close = {},
    orb = { getBoundingClientRect: () => ({ right: 300, top: 400 }), getAttribute: () => 'false' };
  let resolve,
    calls = 0,
    observer;
  const context = {
    Intl,
    Date,
    Math,
    Promise,
    setTimeout: (f) => (timers.push(f), timers.length),
    clearTimeout() {},
    MutationObserver: class {
      constructor(f) {
        observer = f;
      }
      observe() {}
    },
    $: (s) => (s === '.support-orb' ? orb : s === '.weather-whisper-close81' ? close : null),
    esc: String,
    api: () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
    featureOn: () => true,
    featureVisible: () => true,
    window: { innerWidth: 390, innerHeight: 800, addEventListener: (k, f) => (events[k] = f) },
    document: {
      hidden: false,
      body: { append() {} },
      createElement: () => bubble,
      addEventListener: (k, f) => (docEvents[k] = f),
    },
  };
  vm.runInNewContext(source + ';installWeatherWhisper();', context);
  if (action === 'late-navigation') events.hashchange();
  resolve(weather);
  await new Promise((r) => setImmediate(r));
  if (action === 'late-navigation')
    assert.equal(bubble.hidden, true, 'Late forecast must not interrupt another page');
  else {
    assert.equal(bubble.hidden, false);
    if (action === 'close') close.onclick();
    else if (action === 'navigation') events.hashchange();
    else timers[0]();
    assert.equal(bubble.hidden, true);
  }
  assert.equal(
    bubble.dataset.feature,
    undefined,
    'Global feature-entry reconciliation must not unhide a dismissed notice',
  );
  events['features:change']();
  docEvents.visibilitychange();
  observer();
  await Promise.resolve();
  assert.equal(bubble.hidden, true);
  assert.equal(calls, 1, 'Background events do not reload or reopen the notice');
}
(async () => {
  for (const action of ['close', 'navigation', 'timeout', 'late-navigation']) await web(action);
  const p = require('../miniprogram/services/weather-presentation'),
    first = {},
    second = {};
  assert(p.enter(first));
  p.dismiss(first);
  assert(!p.consume(first));
  assert(!p.enter(second));
  delete require.cache[require.resolve('../miniprogram/services/weather-presentation')];
  const fresh = require('../miniprogram/services/weather-presentation');
  assert(fresh.consume(second));
  assert(!fresh.consume(second));
  assert(!fresh.enter(first));
  assert(fs.readFileSync('dist/user/support-chat.js', 'utf8').includes('void refreshWeather()'));
  assert(
    fs
      .readFileSync('miniprogram/components/experience-layer/index.wxml', 'utf8')
      .includes('assistantWeather.temperature'),
  );
  console.log(
    'PASS weather notice: once per refresh/launch, close/navigation/timeout stay dismissed, slow response cannot resurface, assistant retains independent weather access.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
