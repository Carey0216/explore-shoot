const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  vm = require('node:vm');
const load = async (p, bindings = {}) => {
  const source = fs.readFileSync(p, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  global.__surfaceBindings = bindings;
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const {' + Object.keys(bindings).join(',') + '}=globalThis.__surfaceBindings;\n' + source,
      ).toString('base64')
  );
};
(async () => {
  const esc = (s) =>
      String(s ?? '')
        .replaceAll('<', '&lt;')
        .replaceAll('"', '&quot;'),
    icon = () => '<svg></svg>';
  const activity = await load('dist/user/activities.js', {
    api() {},
    esc,
    icon,
    thumbnail: (s) => s,
    bindTopicReminders() {},
  });
  const t = {
    id: 'topic-1',
    title: '<秋色>',
    phase: 'active',
    theme: 'autumn',
    startsAt: '2026-10-19T00:00:00Z',
    endsAt: '2026-10-20T00:00:00Z',
    points: [{ id: 'p' }],
    stamps: [],
  };
  assert(activity.activityCard(t, { points: [] }).includes('&lt;秋色>'));
  assert(activity.activityCard(t, { points: [] }).includes('#topic/topic-1'));
  assert.equal(
    activity.activityCover(t, { points: [{ id: 'p', cover: '/media/a' }] }).url,
    '/media/a',
  );
  assert.equal(activity.activityCover(t, { points: [] }).url, '/shared/nmu-campus.jpg');
  global.location = { hash: '#discover' };
  const back = await load('dist/user/context-back.js');
  assert.equal(back.backDestination(['#topics', '#topic/x', '#place/p'], '#shots'), '#topic/x');
  assert.equal(back.backDestination(['#topic/x'], '#topics'), '#topics');
  const { createDiscoverPages } = await load('dist/user/pages/discover.js', {
    esc,
    icon,
    thumbnail: (s) => s,
    shootingLine: require('../miniprogram/services/content73').shootingLine,
    matchesText: () => true,
    api: async () => ({ points: points.slice(0, 12), page: 1, hasMore: true }),
  });
  const points = Array.from({ length: 15 }, (_, i) => ({
    id: 'p' + i,
    name: '点位' + i,
    theme: '建筑',
    description: '描述',
    createdAt: '2026-10-01',
    open: true,
  }));
  points[0].myReaction = 'dislike';
  const feed = createDiscoverPages({
    state: { catalog: { points }, theme: '全部', page: 'discover', query: '' },
    cover: () => '/photo.jpg',
    heading: () => '',
  });
  assert.equal(feed.filtered().at(-1).id, 'p0');
  const rendered = await feed.discovery();
  assert.equal((rendered.match(/class="point-card content-story73"/g) || []).length, 11);
  assert(rendered.includes('discover-feature73'));
  assert(!rendered.includes('校园不远'));
  assert(!rendered.includes('photo-caption'));
  assert(!rendered.includes('discovery-checkin'));
  assert(rendered.includes('discover-more'));
  // The proxy must map every critical root stylesheet, not just return a 200 HTML fallback.
  const nginx = fs.readFileSync('tools/deploy/nginx-ip.conf.template', 'utf8');
  const html = fs.readFileSync('dist/admin/index.html', 'utf8');
  assert(!html.includes('class="admin-nav"'));
  assert(!html.includes('boot-mobile-nav'));
  for (const tag of html.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) || []) {
    const href = tag.match(/href="([^"]+)"/)[1];
    assert(
      nginx.includes('sub_filter \'"' + (href.startsWith('/shared/') ? '/shared/' : href)),
      href + ' missing Nginx resource rewrite',
    );
  }
  assert(!fs.existsSync('dist/admin/mobile-nav.css'));
  assert(fs.readFileSync('dist/shared/surfaces.css', 'utf8').includes('width: min(100%, 480px)'));
  console.log('PASS v7.1.3 retained web surfaces and proxy contracts.');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
