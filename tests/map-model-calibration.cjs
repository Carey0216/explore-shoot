const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  let form,
    controls,
    feedback = '',
    previews = [],
    writes = [],
    requests = 0,
    begins = 0;
  const panel = {
    isConnected: true,
    open: true,
    listeners: {},
    addEventListener(k, fn) {
      this.listeners[k] = fn;
    },
  };
  const record = {
    id: 'clock',
    lng: 106.1,
    lat: 38.496,
    heading: 0,
    scale: 0.7,
    altitude: 0,
    source: 'fixture',
    confirmed: false,
    revision: 0,
    modelUrl: '/api/admin/campus-map/map-models/clock/content.glb',
  };
  const host = {
    set innerHTML(html) {
      const elements = {};
      for (const match of html.matchAll(/<input name="([^"]+)" value="([^"]*)"/g))
        elements[match[1]] = { value: match[2] };
      elements.confirmed = { checked: html.includes('name="confirmed" checked') };
      controls = Object.fromEntries(
        [
          'data-model-pick',
          'data-model-confirm',
          'data-model-preview',
          'data-model-unpublish',
          '.map-model-size',
        ].map((k) => [k, { hidden: k === 'data-model-confirm' }]),
      );
      form = {
        elements,
        isConnected: true,
        querySelectorAll() {
          return Object.values(controls);
        },
      };
    },
  };
  const api = async (url, method, body) => {
    requests++;
    if (!method) return { models: [record] };
    writes.push({ url, method, body });
    return { model: { ...record, ...body, revision: body.revision + 1 } };
  };
  global.__calibrationTest = {
    $: (selector) =>
      selector === '.map-model-calibration'
        ? panel
        : selector === '.map-model-form-host'
          ? host
          : selector === 'form'
            ? form
            : controls[selector.replace(/^\[|\]$/g, '')],
    api,
    esc: String,
    toast() {},
    validateEditableForm() {},
    formFeedback(_form, message) {
      feedback = message;
    },
  };
  const source = fs
    .readFileSync('dist/admin/map-model-calibration.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  const module = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const {$,api,esc,toast,validateEditableForm,formFeedback}=globalThis.__calibrationTest;' +
          source,
      ).toString('base64')
  );
  const map = {
    async previewModel(value) {
      previews.push(value);
      return { loaded: 1 };
    },
    pick() {},
  };
  const editor = module.setupMapModelCalibration(
    {},
    {
      getMap: () => map,
      accepts: (p) => p.lng > 106 && p.lng < 107 && p.lat > 38 && p.lat < 39,
      onBegin: () => begins++,
    },
  );
  await panel.listeners.toggle();
  assert.equal(requests, 1);
  controls['data-model-pick'].onclick();
  assert(editor.selecting);
  assert.equal(begins, 1);
  editor.pick({ lng: 106.1001, lat: 38.4961 });
  editor.pick({ lng: 106.1002, lat: 38.4962 });
  assert.equal(form.elements.lng.value, '106.1002000');
  await controls['data-model-preview'].onclick();
  assert.equal(previews.length, 0, 'unlocked placement cannot preview or publish');
  controls['data-model-confirm'].onclick();
  editor.pick({ lng: 106.1003, lat: 38.4963 });
  assert.equal(form.elements.lng.value, '106.1002000', 'confirmed click position stays locked');
  await controls['data-model-preview'].onclick();
  assert.equal(previews.length, 1);
  assert.equal(previews[0].lng, 106.1002);
  await form.onsubmit({ preventDefault() {}, submitter: { dataset: { publish: 'true' } } });
  assert.equal(
    writes.length,
    0,
    'publishing requires explicit verification of orientation and size',
  );
  assert.match(feedback, /核对/);
  form.elements.confirmed.checked = true;
  form.oninput({ target: { name: 'heading' } });
  assert.equal(
    form.elements.confirmed.checked,
    false,
    'changing transform invalidates verification',
  );
  await form.onsubmit({ preventDefault() {}, submitter: { dataset: {} } });
  assert.equal(writes[0].body.published, false, 'draft save never publishes accidentally');
  editor.destroy();
  assert.equal(editor.selecting, false);
  delete global.__calibrationTest;
  console.log(
    'PASS model calibration: continuous selection and lock, preview values, publication guard, transform invalidation, draft save and disposal',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
