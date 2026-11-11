const assert = require('node:assert/strict'),
  fs = require('node:fs');
const load = () =>
  import(
    'data:text/javascript;base64,' +
      Buffer.from(
        fs.readFileSync('dist/shared/building-view.js', 'utf8') + '\n//' + Math.random(),
      ).toString('base64')
  );
(async () => {
  let release,
    requests = 0,
    layers = [];
  global.fetch = () => {
    requests++;
    return new Promise((r) => (release = r));
  };
  const api = await load();
  const missing = {
    id: 'b',
    name: '待补绘楼栋',
    coverage: 'missing',
    color: '#a7b2bc',
    height: 24,
    footprint: [
      [106, 38],
      [106.002, 38],
      [106.002, 38.002],
      [106, 38.002],
      [106, 38],
    ],
    holes: [
      [
        [106.0005, 38.0005],
        [106.0005, 38.0015],
        [106.0015, 38.0015],
        [106.0015, 38.0005],
        [106.0005, 38.0005],
      ],
    ],
  };
  const native = { ...missing, id: 'native', coverage: 'native' };
  const draft = { ...missing, id: 'draft', coverage: 'unreviewed' };
  const data = {
    coordinateSystem: 'WGS84',
    buildings: [native],
    supplements: [missing, native, draft],
  };
  class Layer {
    constructor(o) {
      Object.assign(this, o);
      layers.push(this);
    }
    setVisible(v) {
      this.visible = v;
    }
    on(k, v) {
      this[k] = v;
    }
    destroy() {
      this.disposed = true;
    }
  }
  const T = {
    ExtrudablePolygonStyle: class {
      constructor(o) {
        Object.assign(this, o);
      }
    },
    MultiPolygon: Layer,
  };
  let selected;
  const manager = api.tencentBuildings(
    T,
    {},
    (p) => ({ lng: p[0] + 0.006, lat: p[1] }),
    (b) => (selected = b),
  );
  const pending = manager.show(true);
  await manager.show(false);
  release({ ok: true, json: async () => data });
  assert.equal(await pending, null);
  assert.equal(layers.length, 0, 'late result must not paint a hidden layer');
  assert.equal(await manager.show(true), 1);
  assert.equal(requests, 1);
  assert.equal(layers[0].styles.b.extrudeHeight, 24);
  assert.deepEqual(
    layers[0].geometries.map((geometry) => geometry.id),
    ['b'],
  );
  assert.equal(layers[0].geometries[0].paths[0][0].lng, 106.006);
  assert.equal(layers[0].geometries[0].paths.length, 2, 'courtyard remains unfilled');
  layers[0].click({ geometry: { id: 'b' } });
  assert.equal(selected.id, 'b');
  await manager.show(false);
  assert.equal(layers[0].visible, false);
  selected = null;
  layers[0].click({ geometry: { id: 'b' } });
  assert.equal(selected, null);
  await manager.show(true);
  assert.equal(layers[0].visible, true);
  layers[0].click({ geometry: { id: 'b' } });
  assert.equal(selected.id, 'b');
  manager.preview(draft);
  assert.equal(layers[1].id, 'campus-building-review');
  assert.equal(layers[1].disableInteractive, true);
  manager.preview(null);
  assert(layers[1].disposed);
  manager.destroy();
  assert(layers[0].disposed);
  const second = api.tencentBuildings(T, {}, (p) => p);
  const promise = second.show(true);
  second.destroy();
  assert.equal(await promise, null);
  assert.equal(layers.length, 2);
  const bad = await load();
  global.fetch = async () => ({ ok: false });
  await assert.rejects(bad.loadBuildings(), /暂不可用/);
  global.fetch = async () => ({ ok: true, json: async () => data });
  assert.equal((await bad.loadBuildings()).buildings.length, 1, 'failed requests can retry');
  const original = await load();
  global.fetch = async () => ({ ok: true, json: async () => ({ ...data, supplements: [] }) });
  assert.equal(await original.tencentBuildings(T, {}, (p) => p).show(true), 0);
  assert.equal(
    layers.length,
    2,
    'a map without confirmed supplements keeps only the native buildings',
  );
  console.log(
    'PASS building view: lazy data, height extrusion, coordinate conversion, race/disposal, selection and retry',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
