const { uuid } = require('./model');
const copy = (v) => JSON.parse(JSON.stringify(v));
function fields(schema, value = {}) {
  return schema.map((s) => {
    let v =
      value[s.key] ??
      (s.default === 'uuid'
        ? uuid()
        : (s.default ??
          (s.type === 'bool' ? false : s.type === 'multi' || s.type === 'rows' ? [] : '')));
    if (['lines', 'tags'].includes(s.type) && Array.isArray(v))
      v = v.join(s.type === 'tags' ? ', ' : '\n');
    const f = { ...s, value: v };
    if (s.type === 'rows') f.rows = v.map((r) => ({ fields: fields(s.schema, r) }));
    if (s.type === 'pick') {
      f.options = (s.options || []).map((o) => (typeof o === 'string' ? { id: o, label: o } : o));
      f.selected = Math.max(
        0,
        f.options.findIndex((o) => o.id === v),
      );
      if (v === '') f.value = f.options[0]?.id || '';
    }
    if (s.type === 'multi') {
      f.options = (s.options || []).map((o) => ({ ...o, checked: v.includes(o.id) }));
    }
    return f;
  });
}
function value(fields) {
  const out = {};
  for (const f of fields) {
    if (f.omitEmpty && (f.value === '' || f.value === null || f.value === undefined)) continue;
    let v = f.value;
    if (f.type === 'rows') v = f.rows.map((r) => value(r.fields));
    if (f.type === 'number') {
      if (v === '' && f.nullable) v = null;
      else {
        v = Number(v);
        if (!Number.isFinite(v)) throw Error('请填写有效的' + f.label);
        if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))
          throw Error(f.label + '超出允许范围');
      }
    }
    if (f.type === 'lines')
      v = String(v)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (f.type === 'tags')
      v = String(v)
        .split(/[,，\s]+/)
        .filter(Boolean);
    if (
      f.required &&
      (v === '' || v === null || (Array.isArray(v) && !v.length) || (f.type === 'bool' && !v))
    )
      throw Error('请填写或确认' + f.label);
    if (f.omitEmpty && (v === '' || v === null)) continue;
    out[f.key] = v;
  }
  return out;
}
function displayFields(schema, value) {
  const prepared = copy(value || {});
  for (const s of schema)
    if (['lines', 'tags'].includes(s.type) && Array.isArray(prepared[s.key]))
      prepared[s.key] = prepared[s.key].join(s.type === 'tags' ? ', ' : '\n');
  return fields(schema, prepared);
}
module.exports = { fields: displayFields, serialize: value, copy };
