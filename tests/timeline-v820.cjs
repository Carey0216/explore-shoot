const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const photo = (point, id = point) => ({
  id,
  pointId: point,
  pointName: point,
  photo: '/media/' + id,
  date: '2026-10-29T00:00:00Z',
  canRetake: true,
});
const response = (point, id = point, more = false) => ({
  places: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  items: [photo(point, id)],
  hasMore: more,
});

async function web() {
  const calls = [],
    controls = {};
  const host = {
    dataset: {},
    innerHTML: '',
    querySelector(selector) {
      return (controls[selector] ||= {
        addEventListener(event, fn) {
          this[event] = fn;
        },
        style: { setProperty() {} },
      });
    },
    querySelectorAll() {
      return [];
    },
  };
  const context = {
    api: (path) => {
      const d = deferred();
      calls.push({ path, ...d });
      return d.promise;
    },
    esc: String,
    badgeURL: String,
    document: { documentElement: { lang: 'zh-CN' } },
    location: { hash: '#passport?point=a' },
    URLSearchParams,
  };
  vm.runInNewContext(
    fs
      .readFileSync('dist/user/collection-growth.js', 'utf8')
      .replace(/^import .*;\r?\n/gm, '')
      .replace(/export /g, '') + '\nthis.mount = mountTimeline;',
    context,
  );
  context.mount(host, () => true);
  calls[0].resolve(response('a', 'initial'));
  await settle();
  controls['[data-place]'].onchange({ target: { value: 'b' } });
  controls['[data-place]'].onchange({ target: { value: 'a' } });
  assert.equal(calls.length, 3, 'A new place must not be blocked by the old request');
  calls[2].resolve(response('a', 'latest', true));
  await settle();
  calls[1].resolve(response('b', 'stale'));
  await settle();
  assert(host.innerHTML.includes('/media/latest') && !host.innerHTML.includes('/media/stale'));
  controls['[data-more]'].click();
  controls['[data-more]'].click();
  assert.equal(calls.length, 4, 'Repeated load-more taps share the pending page');
  assert(calls[3].path.endsWith('page=2'));
  calls[3].reject(new Error('offline'));
  await settle();
  controls.button.onclick();
  assert(calls[4].path.endsWith('page=2'), 'Retry must request the failed page, not skip it');
  calls[4].resolve(response('a', 'older'));
  await settle();
  assert(host.innerHTML.includes('/media/latest') && host.innerHTML.includes('/media/older'));
}

async function mini() {
  let definition,
    owner = 'alice';
  const calls = [];
  const api = {
    session: () => ({ account: { id: owner } }),
    requireLogin: () => true,
    request(path) {
      const d = deferred();
      calls.push({ path, ...d });
      return d.promise;
    },
    download: async (url) => 'local:' + url,
  };
  const context = {
    Page: (value) => {
      definition = value;
    },
    require: (name) =>
      name.endsWith('/api')
        ? api
        : name.endsWith('/network')
          ? { configuredOrigin: () => 'https://test.example' }
          : { pageOptions: (value) => value },
    wx: { nextTick() {} },
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/timeline/index.js', 'utf8'), context);
  const page = {
    ...definition,
    data: { ...definition.data },
    nativeVisible: true,
    point: 'a',
    timelineOwner: 'https://test.example:' + owner,
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  const first = page.load();
  page.data.places = [{ id: 'a' }, { id: 'b' }];
  page.place({ detail: { value: '1' } });
  calls[1].resolve(response('b', 'latest', true));
  await settle();
  calls[0].resolve(response('a', 'stale'));
  await first;
  await settle();
  assert.equal(page.data.items[0].id, 'latest');
  page.more();
  page.more();
  assert.equal(calls.length, 3);
  calls[2].reject(new Error('offline'));
  await settle();
  const retry = page.retryLoad();
  assert(calls[3].path.endsWith('page=2'));
  calls[3].resolve(response('b', 'older'));
  await retry;
  await settle();
  assert.equal(page.data.items.length, 2);
  const callCount = calls.length;
  page.onShow();
  assert.equal(
    calls.length,
    callCount,
    'Returning to the timeline preserves loaded pages and selection',
  );
  const oldDownload = deferred();
  api.download = () => oldDownload.promise;
  const pendingPair = page.pair();
  owner = 'bob';
  page.onShow();
  assert.equal(page.data.items.length, 0);
  assert.equal(page.data.first, null);
  assert.equal(
    page.data.firstPhoto,
    '',
    'Previous owner images must disappear before the new request finishes',
  );
  oldDownload.resolve('old-account-photo');
  await pendingPair;
  assert.equal(page.data.firstPhoto, '', 'Late private downloads cannot cross account changes');
  calls.at(-1).resolve({ places: [], items: [], hasMore: false });
  await settle();
}

(async () => {
  await web();
  await mini();
  console.log(
    'PASS timeline: latest place wins, failed-page retry, return context and private account isolation.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
