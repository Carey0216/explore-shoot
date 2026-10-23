const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
(async () => {
  let click,
    toast = '',
    admin = false,
    flags = { topics: { enabled: false, visible: true }, plans: { enabled: true, visible: false } };
  const document = {
    getElementById: (id) => (id === 'app' && admin ? {} : null),
    addEventListener: (name, fn) => {
      if (name === 'click') click = fn;
    },
  };
  const context = vm.createContext({
    document,
    fetch: async () => ({ ok: true, json: async () => ({ features: flags }) }),
    localStorage: { setItem() {} },
    navigator: {},
    toast: (m) => (toast = m),
  });
  let s = fs
    .readFileSync('dist/shared/features.js', 'utf8')
    .replace(/^import[^\n]*\n/, '')
    .replace(/export /g, '');
  vm.runInContext(
    s +
      '\nglobalThis.test={loadFeatures,featureOn,featureVisible,allowFeature,featureForRoute,applyFeatureEntries};',
    context,
  );
  const t = context.test;
  await t.loadFeatures();
  assert.equal(t.featureVisible('topics'), true);
  assert.equal(t.featureOn('topics'), false);
  assert.equal(t.featureVisible('plans'), false);
  assert.equal(t.featureForRoute('#checkin/nmu1?activity=a'), 'publishing');
  let prevented = 0;
  click({
    target: { closest: () => ({ dataset: { feature: 'topics' } }) },
    preventDefault() {
      prevented++;
    },
    stopImmediatePropagation() {
      prevented++;
    },
  });
  assert.equal(prevented, 2);
  assert.equal(toast, '功能正在维护中，敬请期待…');
  admin = true;
  prevented = 0;
  click({
    target: { closest: () => ({ dataset: { feature: 'topics' } }) },
    preventDefault() {
      prevented++;
    },
    stopImmediatePropagation() {
      prevented++;
    },
  });
  assert.equal(prevented, 0, 'User maintenance switches do not block the administrator editor');
  admin = false;
  let reflow = false;
  const dock = {
    children: [
      { hidden: false, matches: () => false },
      ...Array.from({ length: 5 }, (_, i) => ({ hidden: i === 1, matches: () => true })),
    ],
    style: {},
    classList: { toggle: (name, value) => (reflow = value) },
  };
  document.getElementById = (id) => (id === 'mobile-nav' ? dock : null);
  document.querySelectorAll = () => [];
  t.applyFeatureEntries();
  assert.equal(dock.style.gridTemplateColumns, 'repeat(4,minmax(0,1fr))');
  assert.equal(reflow, true, 'The decorative selection lens must not reserve a navigation column');
  const forms = require('../miniprogram/services/form-model');
  const fields = forms.fields(
    [
      {
        key: 'rows',
        type: 'rows',
        schema: [
          { key: 'options', type: 'lines' },
          { key: 'answer', type: 'number', min: 0, max: 4 },
        ],
      },
      { key: 'optional', type: 'number', omitEmpty: true, min: 1 },
    ],
    { rows: [{ options: ['一', '二'], answer: 0 }] },
  );
  assert.equal(fields[0].rows[0].fields[0].value, '一\n二');
  assert.deepEqual(forms.serialize(fields), { rows: [{ options: ['一', '二'], answer: 0 }] });
  const modules = require('../miniprogram/services/admin-modules');
  assert.equal(
    modules.can({ role: 'normal', effectivePermissions: [] }, 'features', 'write'),
    false,
  );
  assert.equal(modules.can({ role: 'owner' }, 'permissions', 'write'), true);
  assert.equal(modules.can({ role: 'normal' }, 'updates', 'write'), false);
  console.log(
    'Maintenance visibility, click interception, admin separation and nested native configuration contracts passed.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
