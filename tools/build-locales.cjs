// Build the two-language UI catalogue from reviewed strings and visible source copy.
// Runtime content is translated by the local Java/Python service, never by this build tool.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  acorn = require('acorn'),
  cp = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, 'dist/shared/locales');
fs.mkdirSync(dir, { recursive: true });
const basePath = path.join(dir, 'en-US.base.json');
if (!fs.existsSync(basePath)) {
  const historical = path.join(root, 'tests/.runs/v732');
  const extraContext = {};
  vm.runInNewContext(
    fs
      .readFileSync(path.join(historical, 'old-messages-extra.js'), 'utf8')
      .replace('export const', 'const') + ';result=extraRows;',
    extraContext,
  );
  const generatedContext = {};
  vm.runInNewContext(
    fs
      .readFileSync(path.join(historical, 'old-messages-generated.js'), 'utf8')
      .replace('export const', 'const') + ';result=generatedMessages;',
    generatedContext,
  );
  const context = { extraRows: extraContext.result, generatedMessages: generatedContext.result };
  vm.runInNewContext(
    fs
      .readFileSync(path.join(historical, 'old-messages.js'), 'utf8')
      .replace(/^import.*;\r?\n/gm, '')
      .replace(/export const /g, 'const ') + ';result=Array.from(messages);',
    context,
  );
  fs.writeFileSync(
    basePath,
    JSON.stringify(Object.fromEntries(context.result.map(([k, v]) => [k, v[2]])), null, 2) + '\n',
  );
}
const manual = JSON.parse(fs.readFileSync(path.join(dir, 'en-US.manual.json'), 'utf8'));
const dictionary = { ...JSON.parse(fs.readFileSync(basePath, 'utf8')), ...manual };
const candidates = new Set();
const add = (value) => {
  value = String(value).trim();
  if (
    /[\u3400-\u9fff]/.test(value) &&
    value.length < 360 &&
    !/[<>\n\r]|\$\{/.test(value) &&
    !dictionary[value]
  )
    candidates.add(value);
};
function files(folder) {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() && !['vendor', 'locales', 'assets', '.runs'].includes(e.name)
        ? files(path.join(folder, e.name))
        : e.isFile()
          ? [path.join(folder, e.name)]
          : [],
    );
}
for (const f of [
  ...files(path.join(root, 'dist/user')),
  ...files(path.join(root, 'dist/admin')),
  ...files(path.join(root, 'miniprogram')),
]) {
  const s = fs.readFileSync(f, 'utf8');
  if (f.endsWith('.js')) {
    try {
      const ast = acorn.parse(s, { ecmaVersion: 'latest', sourceType: 'module' });
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'Literal' && typeof n.value === 'string') add(n.value);
        for (const v of Object.values(n))
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') walk(v);
      };
      walk(ast);
    } catch {}
  }
  if (f.endsWith('.wxml') || f.endsWith('.html') || f.endsWith('.js')) {
    for (const m of s.matchAll(/>([^<>]+)</g)) {
      const value = m[1].replace(/{{[\s\S]*?}}/g, '');
      add(value);
    }
    for (const m of s.matchAll(/(?:placeholder|aria-label|title)=["']([^"']+)["']/g)) add(m[1]);
    if (f.endsWith('.wxml'))
      for (const m of s.matchAll(/'([^']*[\u3400-\u9fff][^']*)'/g)) add(m[1]);
  }
}
const pending = [...candidates];
fs.writeFileSync(path.join(dir, 'pending.json'), JSON.stringify(pending));
const args = [
  '-X',
  'utf8',
  path.join(root, 'tools/translate-ui-catalogue.py'),
  basePath,
  path.join(dir, 'en-US.manual.json'),
  path.join(dir, 'pending.json'),
  path.join(dir, 'en-US.json'),
];
const result = cp.spawnSync(
  path.join(root, 'tools/bin/localization/env/Scripts/python.exe'),
  args,
  { cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
);
if (result.status) process.exit(result.status);
const complete = JSON.parse(fs.readFileSync(path.join(dir, 'en-US.json'), 'utf8'));
fs.writeFileSync(
  path.join(dir, 'en-US.js'),
  '// Generated UI catalogue; only Simplified Chinese and English.\nexport default ' +
    JSON.stringify(complete) +
    ';\n',
);
fs.writeFileSync(
  path.join(root, 'miniprogram/services/locale-catalogue.js'),
  '// Generated UI catalogue.\nmodule.exports=' + JSON.stringify(complete) + ';\n',
);
fs.unlinkSync(path.join(dir, 'pending.json'));
console.log('UI catalogue:', Object.keys(complete).length, 'entries.');
