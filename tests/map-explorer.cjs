const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const ui =
    'data:text/javascript;base64,' +
    Buffer.from(fs.readFileSync('dist/shared/ui.js', 'utf8')).toString('base64');
  const source = fs
    .readFileSync('dist/user/map-explorer.js', 'utf8')
    .replace("'/shared/ui.js'", JSON.stringify(ui));
  const { mapExplorerHTML, mapPointHTML, chooseMapPoint } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const p = {
    id: 'one',
    name: '<script>测试</script>',
    description: '校园的<角落>',
    condition: '只在公共区域',
    theme: '建筑',
    open: false,
    trust: 'community',
    source: '测试来源',
    lng: 106,
    lat: 38,
  };
  assert.equal(chooseMapPoint([p], 'one'), p);
  assert.equal(chooseMapPoint([], 'one'), null);
  let html = mapExplorerHTML([p], '<div>筛选</div>', () => '/shared/nmu-library.jpg');
  assert.ok(
    html.includes('aria-pressed="false"') && html.includes('aria-controls="map-point-info"'),
  );
  assert.ok(html.includes('&lt;script&gt;测试&lt;/script&gt;') && !html.includes('<script>'));
  assert.ok(mapExplorerHTML([], '', () => '').includes('没有匹配点位'));
  html = mapPointHTML(p, {
    cover: () => '/x',
    status: () => '<span>社区共创警示</span>',
    saved: false,
    canReport: true,
    expanded: false,
  });
  assert.ok(html.includes('data-route-to="one" disabled'));
  assert.ok(html.includes('aria-expanded="false"') && html.includes('map-selected-body '));
  assert.ok(
    html.includes('社区共创警示') &&
      html.includes('不代表该点位当前现场') &&
      html.includes('map-report'),
  );
  html = mapPointHTML(
    { ...p, open: true, cover: '/media/owned', authorName: '用户' },
    { cover: (p) => p.cover, status: () => '', saved: true, canReport: false, expanded: true },
  );
  assert.ok(html.includes('aria-expanded="true"') && html.includes('map-selected-body expanded'));
  assert.ok(!html.includes('map-report') && !html.includes('data-route-to="one" disabled'));
  console.log(
    'Map explorer checks passed: filtered selections, escaped community details, trust notices, closed-point navigation and accessible expand/collapse controls.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
