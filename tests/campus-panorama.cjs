const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
(async () => {
  const source = fs
    .readFileSync('dist/shared/campus-panorama.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const { panoramaCamera, panoramaFaces, panoramaViews, mountPanorama } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(source + '\nexport { mountPanorama };').toString('base64')
  );
  const manifest = JSON.parse(fs.readFileSync('dist/shared/panorama/manifest.json', 'utf8'));
  const urls = panoramaFaces(manifest);
  assert.deepEqual(
    urls.map((u) => u.match(/face_(\w)/)[1]),
    ['l', 'r', 'u', 'd', 'b', 'f'],
  );
  for (const face of manifest.faces) {
    const bytes = fs.readFileSync('dist/shared/panorama/' + face.file);
    assert.equal(bytes.length, face.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), face.sha256);
  }
  assert.throws(() => panoramaFaces({ ...manifest, faces: manifest.faces.slice(1) }));
  assert.throws(() =>
    panoramaFaces({
      ...manifest,
      faces: manifest.faces.map((f) => ({ ...f, file: '../../secret.jpg' })),
    }),
  );
  const camera = panoramaCamera();
  camera.turn(-1080, 999);
  assert.equal(camera.read().pitch, 85);
  assert.equal(camera.read().yaw, 180);
  camera.zoom(-999);
  assert.equal(camera.read().fov, 35);
  camera.zoom(999);
  assert.equal(camera.read().fov, 100);
  camera.select(panoramaViews[1]);
  assert.deepEqual(camera.read(), { yaw: 270, pitch: -30, fov: 75 });
  // Closing before images arrive must release the renderer and never mount a late canvas.
  let mounts = 0,
    disposals = 0,
    losses = 0,
    disconnects = 0;
  const listeners = new Set(),
    images = [];
  const host = {
    clientWidth: 600,
    clientHeight: 400,
    replaceChildren() {
      mounts++;
    },
    addEventListener(type, fn) {
      listeners.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.delete(fn);
    },
  };
  const status = { textContent: '' };
  const dialog = {
    querySelector: (s) => (s === '.panorama-stage' ? host : status),
    querySelectorAll: () => [],
  };
  global.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
  global.cancelAnimationFrame = () => {};
  global.Image = class {
    constructor() {
      images.push(this);
    }
    removeAttribute() {}
  };
  global.ResizeObserver = class {
    observe() {}
    disconnect() {
      disconnects++;
    }
  };
  const canvas = {
    addEventListener(type, fn) {
      listeners.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.delete(fn);
    },
  };
  const T = {
    WebGLRenderer: class {
      constructor() {
        this.domElement = canvas;
        this.capabilities = { maxCubemapSize: 4096 };
      }
      setPixelRatio() {}
      setClearColor() {}
      dispose() {
        disposals++;
      }
      forceContextLoss() {
        losses++;
      }
    },
    Scene: class {},
    PerspectiveCamera: class {},
  };
  const cleanup = mountPanorama(dialog, T, manifest),
    late = images.map((img) => img.onload);
  cleanup();
  cleanup();
  images.forEach((image, i) => late[i]());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mounts, 0);
  assert.equal(disposals, 1);
  assert.equal(losses, 1);
  assert.equal(disconnects, 1);
  assert.equal(listeners.size, 0);
  assert(images.every((i) => i.onload === null && i.onerror === null));
  console.log('PASS panorama asset integrity, face order, camera limits, and late-load cleanup');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
