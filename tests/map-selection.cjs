const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const source = fs
    .readFileSync('dist/admin/map-selection.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  const { createPointSelection, validateEditableForm } = await import(
    'data:text/javascript;base64,' + Buffer.from('const esc=String;' + source).toString('base64')
  );
  const changes = [],
    confirmed = [],
    errors = [];
  const selection = createPointSelection({
    onChange: (p) => changes.push(p),
    onConfirm: (p) => confirmed.push(p),
    onError: (m) => errors.push(m),
    accepts: (p) => p.lng > 106 && p.lng < 107,
  });
  assert.equal(selection.accept({ lng: 106.1, lat: 38.5 }), false);
  selection.begin({ lng: 106.1, lat: 38.5 });
  assert.throws(() => selection.validate(), /确认选点/);
  for (const lng of [106.11, 106.12, 106.13]) assert(selection.accept({ lng, lat: 38.5 }));
  assert.equal(changes.length, 3);
  assert(selection.confirm());
  assert.equal(confirmed[0].lng, 106.13);
  assert.equal(selection.accept({ lng: 106.2, lat: 38.5 }), false);
  selection.validate();
  selection.begin(confirmed[0]);
  assert.equal(selection.accept({ lng: 116.4, lat: 39.9 }), false);
  assert.equal(selection.accept({ lng: NaN, lat: 38 }), false);
  assert.equal(changes.length, 3);
  assert(errors.length >= 2);
  assert(selection.accept({ lng: 106.2, lat: 38.49 }));
  assert(selection.confirm());
  assert.equal(confirmed[1].lng, 106.2);
  selection.reset();
  assert.equal(selection.selecting, false);
  const folded = { open: false },
    feedback = { textContent: '', classList: { toggle() {} }, scrollIntoView() {} };
  let focused = false;
  const invalid = {
    willValidate: true,
    validity: { valid: false },
    validationMessage: '请输入有效尺寸',
    closest: (s) => (s === 'details' ? folded : { textContent: '东西宽度（米）' }),
    scrollIntoView() {},
    focus() {
      focused = true;
    },
  };
  assert.throws(
    () => validateEditableForm({ elements: [invalid], querySelector: () => feedback }),
    /东西宽度/,
  );
  assert(folded.open && focused);
  assert(feedback.textContent.includes('请输入有效尺寸'));
  validateEditableForm({
    elements: [{ willValidate: true, validity: { valid: true }, value: '51.68' }],
  });
  console.log(
    'PASS map selection: repeated picks, explicit confirmation and lock, restart, invalid coordinates, folded field feedback and preserved decimal precision.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
