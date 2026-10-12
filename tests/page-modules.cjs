const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  acorn = require('acorn');
const modules = new Map();
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.js')) {
      const source = fs.readFileSync(file, 'utf8');
      modules.set(path.resolve(file), {
        source,
        ast: acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }),
      });
    }
  }
}
walk('dist');
function names(ast) {
  const out = new Set();
  for (const n of ast.body) {
    if (n.type === 'ExportDefaultDeclaration') out.add('default');
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration?.id) out.add(n.declaration.id.name);
      for (const d of n.declaration?.declarations || []) out.add(d.id.name);
      for (const s of n.specifiers) out.add(s.exported.name);
    }
  }
  return out;
}
for (const [file, entry] of modules) {
  for (const n of entry.ast.body.filter((n) => n.type === 'ImportDeclaration')) {
    const ref = n.source.value;
    assert(!ref.startsWith('http'), 'Browser SDKs load through controlled adapters');
    const target = path.resolve(
      ref.startsWith('/shared/')
        ? 'dist' + ref
        : ref.startsWith('/')
          ? 'dist/' + (file.includes(path.sep + 'admin' + path.sep) ? 'admin' : 'user') + ref
          : path.resolve(path.dirname(file), ref),
    );
    assert(modules.has(target), 'Unresolved browser module: ' + file + ' -> ' + ref);
    const exports = names(modules.get(target).ast);
    for (const spec of n.specifiers)
      if (spec.type !== 'ImportNamespaceSpecifier')
        assert(
          exports.has(spec.imported?.name || 'default'),
          'Missing export: ' + ref + ' ' + spec.local.name,
        );
  }
}
(async () => {
  const source = fs
    .readFileSync('dist/user/pages/account.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  let answer;
  const main = { innerHTML: 'untouched' },
    node = { addEventListener() {} };
  const api = () => new Promise((resolve) => (answer = resolve));
  global.__accountPageTest = {
    api,
    $: (s) => (s === '#main' ? main : node),
    esc: (s) => String(s),
    icon: () => '',
    modal() {},
    closeModal() {},
    formSubmit() {},
    errorHTML: '',
    authURL: () => '',
    avatarHTML: () => '',
    profileDialog() {},
    passwordDialog() {},
    setPreferenceAccount() {},
    settingsEntry: () => '',
    bindDraftForm() {},
  };
  const names = [
    'api',
    '$',
    'esc',
    'icon',
    'modal',
    'closeModal',
    'formSubmit',
    'errorHTML',
    'authURL',
    'avatarHTML',
    'profileDialog',
    'passwordDialog',
    'setPreferenceAccount',
    'settingsEntry',
    'bindDraftForm',
  ];
  const module = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const {' + names.join(',') + '}=globalThis.__accountPageTest;\n' + source,
      ).toString('base64')
  );
  const state = {
    account: { id: 'alice', nickname: 'Alice', username: 'alice', scoutStatus: 'approved' },
    page: 'me',
    overview: { explorations: 0, bookmarks: 0 },
    savedPoints: [],
    localQuery: '',
  };
  const page = module.createAccountPages({
    state,
    heading: () => '',
    card: () => '',
    status: () => '',
    bindCollectionSearch() {},
    bindPoints() {},
    render() {},
    loadPrivate: async () => {},
    stopTracking() {},
    accountDraft() {},
  });
  const pending = page.mePage();
  await Promise.resolve();
  state.account = { id: 'bob' };
  answer({ applications: [], points: [], reports: [] });
  await pending;
  assert.equal(
    main.innerHTML,
    'untouched',
    'An old private community response must not replace the new account page',
  );
  delete global.__accountPageTest;
  console.log(
    'PASS page modules: every local import/export resolves; late private response cannot overwrite a different account.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
