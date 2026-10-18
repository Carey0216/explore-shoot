const assert = require('node:assert/strict'),
  fs = require('node:fs');
const mod = (source) =>
  import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
(async () => {
  const model = await mod(fs.readFileSync('dist/user/checkin-model.js', 'utf8'));
  const near = { id: 'near', lng: 106.1, lat: 38.49 },
    far = { id: 'far', lng: 106.11, lat: 38.5 },
    points = [far, near];
  assert.equal(model.sortNearby(points, near)[0].id, 'near');
  assert.equal(points[0].id, 'far');
  assert.equal(model.distance(near, near), 0);
  assert.equal(model.sortNearby(points, null), points);
  const outings = await mod(
    fs
      .readFileSync('dist/user/outings.js', 'utf8')
      .replace(/^import [\s\S]*?;\r?\n/gm, 'const icon=()=>"";\n'),
  );
  assert.deepEqual(
    outings.mobileItems.map((i) => i[2]),
    ['社区', '活动', '出行', '我的'],
  );
  assert.equal(outings.mobileItems[2][0], 'map');
  for (const page of ['map', 'navigate', 'routes', 'active'])
    assert(outings.navSelected('map', page));
  assert(outings.navSelected('discover', 'place'));
  assert.equal((outings.outingTabs('map').match(/<a /g) || []).length, 3);
  const auth =
    fs.readFileSync('dist/user/register.html', 'utf8') +
    fs.readFileSync('dist/shared/auth.js', 'utf8');
  assert(/邀请码/.test(auth));
  assert(!/name="inviteCode"[^>]*required/.test(auth));
  console.log(
    'PASS shots client: nearby sorting stays on-device, input order preserved, four shared destinations and optional registration invite.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
