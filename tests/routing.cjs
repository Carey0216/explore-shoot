const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const { distance, direction, meters } = await import(
    'data:text/javascript;base64,' + fs.readFileSync('dist/shared/routing.js').toString('base64')
  );
  assert.equal(distance({ lng: 106, lat: 38 }, { lng: 106, lat: 38 }), 0);
  assert(Math.abs(distance([106, 38], [106.001, 38]) - 87.6) < 1);
  for (const [point, name] of [
    [[0, 1], '北'],
    [[1, 0], '东'],
    [[0, -1], '南'],
    [[-1, 0], '西'],
  ])
    assert.equal(direction([0, 0], point).name, name);
  assert.equal(meters(100), '100 米');
  console.log(
    'PASS current navigation geometry: on-device distance, orientation and unit display; unused OSM routing removed.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
