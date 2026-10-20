const assert = require('node:assert/strict'),
  fs = require('node:fs');
let serial = 0;
async function load(file, bindings = {}) {
  global.__v720 = bindings;
  const code = fs.readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(
        `const {${Object.keys(bindings).join(',')}}=globalThis.__v720;\n` +
          code +
          `\n// module ${serial++}`,
      ).toString('base64')
  );
}
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
(async () => {
  const { reorder, restorePlanDraft } = await load('dist/user/plan-execution.js');
  const restored = restorePlanDraft(
    { id: 'p', items: [{ id: 'i', spotId: 's', title: '真实标题', minutes: 5, done: false }] },
    { items: [{ id: 'i', spotId: 's', minutes: 9, done: true }] },
  );
  assert.equal(restored.items[0].title, '真实标题');
  assert.equal(restored.items[0].minutes, 9);
  assert.equal(restored.items[0].done, true);
  const { visibleMapPoints, mapDot } = await load('dist/shared/map-density.js');
  const dense = Array.from({ length: 300 }, (_, i) => ({
    id: 'p' + String(i).padStart(3, '0'),
    lng: 106.1 + (i % 20) * 0.00018,
    lat: 38.49 + Math.floor(i / 20) * 0.00018,
    trust: i % 2 ? 'community' : 'certified',
  }));
  const far = visibleMapPoints(dense, 14),
    near = visibleMapPoints(dense, 19);
  assert(far.length < near.length);
  assert(far.length <= 14);
  assert(near.length <= 180);
  assert(visibleMapPoints(dense, 14, { selected: 'p299' }).some((p) => p.id === 'p299'));
  assert.deepEqual(
    visibleMapPoints(
      [
        { id: 'orange', lng: 106.1, lat: 38.49, trust: 'community' },
        { id: 'green', lng: 106.1, lat: 38.49, trust: 'certified' },
      ],
      16,
    ).map((p) => p.id),
    ['green'],
  );
  assert(decodeURIComponent(mapDot('#dc954e', 4.5)).includes('r="4.5"'));
  const { placePhotos } = await load('dist/user/place-gallery.js');
  assert.equal(
    placePhotos(
      { gallery: ['javascript:alert(1)', '/media/11111111-1111-1111-1111-111111111111'] },
      '/shared/nmu-library.jpg',
    ).length,
    2,
  );

  const source = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(
    reorder(source, 0, 2).map((x) => x.id),
    ['b', 'c', 'a'],
  );
  assert.deepEqual(
    reorder(source, 2, 0).map((x) => x.id),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(
    source.map((x) => x.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(reorder(source, -1, 1), source);
  assert.deepEqual(reorder(source, 0, 99), source);
  const calls = [],
    renders = [],
    statuses = [];
  let watcher,
    bounds = { west: 106.09, south: 38.49, east: 106.11, north: 38.51 };
  const api = (path) => new Promise((resolve, reject) => calls.push({ path, resolve, reject }));
  const { viewportLoader, campusBounds } = await load('dist/user/map-viewport.js', { api });
  assert.deepEqual(
    campusBounds({
      boundary: [
        [1, 2],
        [3, 4],
      ],
    }),
    { west: 0.9999, east: 3.0001, south: 1.9999, north: 4.0001 },
  );
  assert.equal(campusBounds({ boundary: [] }), null);
  const map = {
    getViewport: () => bounds,
    onViewport: (callback) => {
      watcher = callback;
      return () => {
        watcher = null;
      };
    },
  };
  const loader = viewportLoader({
    map,
    campus: {},
    onPoints: (items) => renders.push(items),
    onStatus: (...s) => statuses.push(s),
    alive: () => true,
  });
  assert.equal(calls.length, 1);
  bounds = { ...bounds, west: 106.095 };
  watcher();
  watcher();
  await new Promise((r) => setTimeout(r, 280));
  assert.equal(calls.length, 2);
  const points = Array.from({ length: 60 }, (_, i) => ({ id: 'p' + i }));
  calls[1].resolve({ points, total: 140, page: 1, hasMore: true });
  await Promise.resolve();
  await Promise.resolve();
  calls[0].resolve({ points: [{ id: 'stale' }], total: 1, page: 1, hasMore: false });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(renders.length, 1);
  assert.equal(renders[0].length, 60);
  assert(!renders[0].some((p) => p.id === 'stale'));
  const more = loader.more();
  assert(calls[2].path.includes('page=2'));
  calls[2].resolve({
    points: [...points.slice(0, 2), { id: 'new' }],
    total: 140,
    page: 2,
    hasMore: true,
  });
  await more;
  assert.equal(renders.at(-1).length, 61);
  const interrupted = loader.refresh();
  loader.dispose();
  calls[3].resolve({ points: [{ id: 'after-dispose' }], total: 1, page: 1, hasMore: false });
  await interrupted;
  assert.equal(renders.length, 2);
  assert.equal(watcher, null);
  const { guideCards } = await load('dist/user/guides.js', { esc, icon: () => '' });
  const guides = [
    {
      id: 'guide-1',
      title: '<img onerror=alert(1)>',
      description: '描述',
      scene: 'break',
      minutes: 15,
      points: [],
    },
    {
      id: 'guide-2',
      title: '周末',
      description: '描述',
      scene: 'weekend',
      minutes: 60,
      points: [],
    },
  ];
  const cards = guideCards(guides, 'break');
  assert(cards.includes('&lt;img'));
  assert(!cards.includes('<img onerror'));
  assert(!cards.includes('周末'));
  assert(cards.includes('#guide/guide-1'));
  const { safeTarget } = await load('dist/shared/rich-message.js');
  const { noticeCard } = await load('dist/shared/notice-card.js', {
    esc,
    icon: () => '',
    date: () => '测试时间',
    safeTarget,
  });
  const notice = noticeCard(
    {
      id: 'notice-1',
      title: '"<script>',
      message: '<img src=x onerror=alert(1)>',
      category: 'message',
      target: 'javascript:alert(1)',
      requester: { nickname: '<svg onload=alert(1)>', username: 'test' },
    },
    { admin: true, connect: true },
  );
  assert(!notice.includes('javascript:'));
  assert(!notice.includes('<script>'));
  assert(!notice.includes('<img'));
  assert(notice.includes('&lt;svg'));
  assert(notice.includes('data-inbox-select'));
  const detail = noticeCard(
    { id: 'n', title: '标题', message: '第一行\n第二行', category: 'system', target: '#me' },
    { detail: true },
  );
  assert(detail.includes('<h1>标题</h1>'));
  assert(detail.includes('第一行\n第二行'));
  assert(!detail.includes('data-notice-select'));
  for (const target of [
    '#applications',
    '#reports',
    '#works',
    '#shooting-spots',
    '#messages/ab12-12',
  ]) {
    assert(
      noticeCard({ id: 'n', title: 'review', message: '', target }, { admin: true }).includes(
        'href="' + target + '"',
      ),
    );
  }
  assert(
    !noticeCard(
      { id: 'n', title: 'unsafe', message: '', target: '#messages/<script>' },
      { admin: true },
    ).includes('href='),
  );
  assert.equal(safeTarget('#guides'), '#guides');
  assert.equal(safeTarget('#updates'), '#updates');
  const { onboardingState } = await load('dist/shared/onboarding-state.js');
  const stored = new Map();
  const browserStore = {
    getItem: (k) => stored.get(k) || null,
    setItem: (k, v) => stored.set(k, v),
    key: (i) => [...stored.keys()][i],
    get length() {
      return stored.size;
    },
  };
  const first = onboardingState('user', { id: 'a' }, browserStore);
  assert(!first.experienced());
  first.finish('7.2.0');
  assert(first.experienced());
  assert(first.seen('7.2.0'));
  assert(!first.seen('7.3.0'), 'An experienced account still receives a future What’s New');
  assert(
    !onboardingState('admin', { id: 'a' }, browserStore).experienced(),
    'Admin and user tours are separate',
  );
  assert(
    !onboardingState('user', { id: 'b' }, browserStore).experienced(),
    'A new account gets the full tour',
  );
  assert(
    !onboardingState('user', { id: 'a' }, { getItem: () => null, length: 0 }).experienced(),
    'A new browser gets the full tour',
  );
  stored.set('explore-onboarding:7.1:a-legacy', 'done');
  assert(onboardingState('user', { id: 'a-legacy' }, browserStore).experienced());

  console.log(
    'PASS v7.2 immutable accessible reordering, coalesced viewport pages/deduplication/stale cancellation, scene filtering and safe notification detail.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
