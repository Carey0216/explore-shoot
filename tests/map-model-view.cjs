const assert = require('node:assert/strict'),
  fs = require('node:fs');
const load = (file) =>
  import(
    'data:text/javascript;base64,' + Buffer.from(fs.readFileSync(file, 'utf8')).toString('base64')
  );
(async () => {
  const api = await load('dist/shared/map-model-view.js');
  const made = [];
  class Tileset {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.visible = true;
      made.push(this);
    }
    hide() {
      this.visible = false;
    }
    show() {
      this.visible = true;
    }
    on(k, fn) {
      this.handlers[k] = fn;
    }
    off(k) {
      delete this.handlers[k];
    }
    destroy() {
      this.disposed = true;
    }
  }
  const T = {
      model: { GLTFModel: Tileset },
      LatLng: class {
        constructor(lat, lng, height = 0) {
          Object.assign(this, { lat, lng, height });
        }
      },
    },
    map = {
      glLatLngToPosition: (p) => ({
        x: ((p.lng * 6378137 * Math.PI) / 180) * 10,
        y: ((p.lat * 6378137 * Math.PI) / 180) * 10,
        z: p.height * 8,
      }),
    };
  const coordinate = (p) => ({ lat: p.lat || 38, lng: (p.lng || 106) + 0.006 });
  const clock = {
    id: 'clock',
    published: true,
    confirmed: true,
    modelUrl: '/api/maps/map-models/clock/content.glb',
    scale: 0.7,
    heading: 0,
    altitude: 0,
  };
  let release;
  global.fetch = () => new Promise((r) => (release = r));
  const manager = api.tencentMapModels(T, map, { coordinate });
  const pending = manager.show(true);
  await manager.show(false);
  release({ ok: true, json: async () => ({ coordinateSystem: 'WGS84', models: [clock] }) });
  assert.equal(await pending, null);
  assert.equal(made.length, 0, 'late API response must not create a model');
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      coordinateSystem: 'WGS84',
      models: [
        clock,
        { ...clock, confirmed: false },
        { ...clock, modelUrl: 'https://evil.test/a.glb' },
      ],
    }),
  });
  const visible = manager.show(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(made.length, 1, 'drafts and remote caller URLs are not rendered');
  assert.equal(made[0].options.map, map, 'model shares the live route map');
  assert.equal(made[0].options.position.lng, 106.006);
  assert(Math.abs(made[0].options.scale[0] - 7) < 1e-6);
  assert.equal(made[0].options.scale[1], 5.6);
  assert.equal(made[0].options.scale[2], made[0].options.scale[0]);
  assert.deepEqual(made[0].options.rotation, [0, 0, -0]);
  assert(!('mask' in made[0].options), 'no broad mask removes route labels or real POIs');
  assert.equal(made[0].visible, false, 'GLB remains hidden until loaded');
  made[0].handlers.loaded();
  assert.deepEqual(await visible, { loaded: 1, failed: 0 });
  assert(made[0].visible);
  const retry = manager.preview({
    ...clock,
    modelUrl: '/api/admin/campus-map/map-models/clock/content.glb',
  });
  assert(made[0].disposed);
  const late = made[1].handlers.loaded;
  await manager.show(false);
  late();
  assert.equal(await retry, null);
  assert(made[1].disposed && !made[1].visible);
  const failing = manager.preview(clock);
  made[2].handlers.load_failed();
  assert.deepEqual(await failing, { loaded: 0, failed: 1 });
  manager.destroy();
  assert(made[2].disposed);
  assert.equal(await manager.preview(clock), null);
  const absent = api.tencentMapModels({}, map);
  assert.deepEqual(await absent.preview(clock), { loaded: 0, failed: 1 });
  absent.destroy();
  const timed = api.tencentMapModels(T, map, { timeout: 5, coordinate });
  assert.deepEqual(await timed.preview(clock), { loaded: 0, failed: 1 });
  timed.destroy();
  class BrokenModel extends Tileset {
    on() {
      throw Error('SDK subscription failure');
    }
  }
  const broken = api.tencentMapModels({ ...T, model: { GLTFModel: BrokenModel } }, map, {
    coordinate,
  });
  assert.deepEqual(await broken.preview(clock), { loaded: 0, failed: 1 });
  broken.destroy();
  assert(made.at(-1).disposed, 'failed setup must still release the model');
  assert.throws(() => api.modelPlacement(T, map, { ...clock, scale: 99 }, coordinate));
  assert.throws(() =>
    api.modelPlacement(T, { glLatLngToPosition: () => ({ z: 0 }) }, clock, coordinate),
  );
  console.log(
    'PASS map model: live map binding, WGS84, draft and URL protection, lazy loading, failures, cancellation and disposal',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
