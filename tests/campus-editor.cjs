const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const nodes = new Map(),
    handlers = new Map();
  const node = (key) => {
    if (!nodes.has(key))
      nodes.set(key, {
        isConnected: true,
        value: '',
        textContent: '',
        innerHTML: '',
        addEventListener() {},
        querySelectorAll() {
          return [];
        },
      });
    return nodes.get(key);
  };
  let answer,
    mapAnswer,
    disposed = 0;
  global.window = {
    addEventListener: (event, fn) => handlers.set(event, fn),
    removeEventListener: (event) => handlers.delete(event),
  };
  global.__campusEditorTest = {
    $: node,
    api: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
    esc: String,
    toast() {},
    openCampusModel() {},
    openCampusPanorama() {},
    setupMapModelCalibration: () => ({
      selecting: false,
      dirty: false,
      stopPicking() {},
      destroy() {},
    }),
    mapModelCalibrationHTML: () => '',
    campusMap: () =>
      new Promise((resolve) => {
        mapAnswer = resolve;
      }),
  };
  const selectionSource = fs
    .readFileSync('dist/admin/map-selection.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  const selectionModule = await import(
    'data:text/javascript;base64,' +
      Buffer.from('const esc=String;' + selectionSource).toString('base64')
  );
  Object.assign(global.__campusEditorTest, selectionModule, { inCampus: () => true });
  const source = fs
    .readFileSync('dist/admin/pages/campus-map.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  const mod = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const {$,api,esc,toast,campusMap,openCampusModel,openCampusPanorama,inCampus,pointPickerHTML,createPointSelection,validateEditableForm,formFeedback,setupMapModelCalibration,mapModelCalibrationHTML}=globalThis.__campusEditorTest;' +
          source,
      ).toString('base64')
  );
  const catalog = { categories: ['学院'], campus: {}, map: {}, places: [] };
  const cleanup = mod.setupCampusEditor();
  answer(catalog);
  await new Promise((resolve) => setImmediate(resolve));
  // Provider failure returns an unavailable adapter with no filtering method.
  mapAnswer({
    destroy() {
      disposed++;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(node('#campus-list-status').textContent, '0 个校园地点');
  cleanup();
  assert.equal(disposed, 1);
  assert(!handlers.has('beforeunload'));
  const late = mod.setupCampusEditor();
  answer(catalog);
  await new Promise((resolve) => setImmediate(resolve));
  late();
  mapAnswer({
    destroy() {
      disposed++;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disposed, 2, 'map resolving after page disposal must be destroyed');
  delete global.window;
  delete global.__campusEditorTest;
  console.log(
    'PASS campus editor: provider failure keeps list usable; late map and page listeners are cleaned up.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
