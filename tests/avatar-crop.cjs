const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const code = fs
    .readFileSync('dist/shared/avatar-crop.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  global.__cropTest = { readPhoto: async () => 'normalized-image' };
  const { cropRect, mountAvatarCrop } = await import(
    'data:text/javascript;base64,' +
      Buffer.from('const {readPhoto}=globalThis.__cropTest;\n' + code).toString('base64')
  );
  for (const [w, h] of [
    [400, 200],
    [200, 400],
    [512, 512],
  ])
    for (const zoom of [0, 1, 2, 4, 8])
      for (const x of [-100, 0, w / 2, w + 100]) {
        const r = cropRect(w, h, zoom, x, h + 100);
        assert(r.sx >= 0 && r.sy >= 0 && r.sx + r.size <= w && r.sy + r.size <= h);
        assert(r.zoom >= 1 && r.zoom <= 4);
      }
  assert.throws(() => cropRect(NaN, 100));
  assert.throws(() => cropRect(0, 100));
  global.Image = class {
    naturalWidth = 400;
    naturalHeight = 200;
    set src(value) {
      queueMicrotask(() => this.onload());
    }
  };
  const draws = [],
    values = [],
    events = new Map(),
    canvas = {
      getContext: () => ({ drawImage: (...args) => draws.push(args) }),
      toDataURL: () =>
        'data:image/jpeg;base64,' +
        Buffer.from(JSON.stringify(draws.at(-1).slice(1, 5))).toString('base64'),
      getBoundingClientRect: () => ({ width: 200 }),
      setPointerCapture() {},
      addEventListener: (e, fn) => events.set(e, fn),
      removeEventListener: (e) => events.delete(e),
    },
    slider = { value: '1' },
    center = {},
    box = {
      hidden: true,
      querySelector: (s) => (s === 'canvas' ? canvas : s === 'input' ? slider : center),
    };
  const crop = await mountAvatarCrop({}, box, (v) => values.push(v));
  assert.equal(box.hidden, false);
  assert.deepEqual(draws.at(-1).slice(1, 5), [100, 0, 200, 200]);
  const before = values.at(-1);
  canvas.onpointerdown({ button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {} });
  canvas.onpointermove({ pointerId: 1, clientX: 80, clientY: 0, preventDefault() {} });
  assert.notEqual(values.at(-1), before);
  assert.equal(draws.at(-1)[1], 20, 'Dragging chooses a non-central square');
  canvas.onpointerup({ pointerId: 1 });
  slider.value = '2';
  slider.oninput();
  assert.equal(draws.at(-1)[3], 100);
  assert.equal(draws.at(-1)[4], 100, 'Zoom always preserves square ratio');
  canvas.onkeydown({ key: 'ArrowLeft', preventDefault() {} });
  assert(draws.at(-1)[1] > 20);
  center.onclick();
  assert.deepEqual(draws.at(-1).slice(1, 5), [100, 0, 200, 200]);
  assert.equal(slider.value, '1');
  crop.destroy();
  assert.equal(box.hidden, true);
  assert.equal(canvas.onpointermove, null);
  assert.equal(events.size, 0);
  delete global.__cropTest;
  console.log(
    'Avatar crop checks passed: wide/tall/square bounds, fixed ratio, drag, zoom, keyboard, reset, JPEG selection and cleanup.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
