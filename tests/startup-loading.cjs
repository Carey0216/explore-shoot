const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

function graph(file, seen = new Set()) {
  file = path.resolve(file);
  if (seen.has(file)) return seen;
  seen.add(file);
  const ast = acorn.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });
  for (const node of ast.body.filter((n) => n.type === 'ImportDeclaration')) {
    const ref = node.source.value;
    graph(
      ref.startsWith('/shared/')
        ? 'dist' + ref
        : ref.startsWith('/')
          ? path.join('dist', file.includes(path.sep + 'admin' + path.sep) ? 'admin' : 'user', ref)
          : path.resolve(path.dirname(file), ref),
      seen,
    );
  }
  return seen;
}
for (const entry of ['dist/user/app.js', 'dist/admin/entry.js', 'dist/admin/app.js']) {
  const files = [...graph(entry)].map((s) => s.replaceAll('\\', '/'));
  for (const forbidden of [
    '/shared/map.js',
    '/shared/navigation.js',
    '/shared/campus-model.js',
    '/shared/campus-panorama.js',
    '/shared/vendor/three/',
    '/shared/messages.js',
  ]) {
    assert(!files.some((file) => file.includes(forbidden)), entry + ' eagerly loads ' + forbidden);
  }
  console.log('Initial module graph:', entry, files.length);
}

(async () => {
  const userCode = fs.readFileSync('dist/user/app.js', 'utf8');
  const ast = acorn.parse(userCode, { ecmaVersion: 'latest', sourceType: 'module' });
  const node = ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'oncePage');
  const context = vm.createContext({ Map });
  vm.runInContext('const pageLoads = new Map();' + userCode.slice(node.start, node.end), context);
  let calls = 0;
  let finish;
  context.work = () => {
    calls++;
    return new Promise((resolve) => (finish = resolve));
  };
  const first = vm.runInContext("oncePage('map', work)", context);
  const duplicate = vm.runInContext("oncePage('map', work)", context);
  assert.equal(first, duplicate);
  assert.equal(calls, 1);
  finish('ready');
  assert.equal(await first, 'ready');
  context.failure = () => Promise.reject(new Error('offline'));
  await assert.rejects(vm.runInContext("oncePage('retry', failure)", context), /offline/);
  context.retry = () => Promise.resolve('recovered');
  assert.equal(await vm.runInContext("oncePage('retry', retry)", context), 'recovered');

  const module = (code) =>
    import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const user = await module(
    fs
      .readFileSync('dist/user/outings.js', 'utf8')
      .replace(/^import .*;\r?\n/, 'const icon = () => "";\n'),
  );
  assert.deepEqual(
    user.mobileItems.map((x) => x[0]),
    ['shots', 'discover', 'map', 'me'],
  );
  const admin = await module(fs.readFileSync('dist/admin/navigation.js', 'utf8'));
  assert.deepEqual(
    admin.adminGroups.map((g) => g.label),
    ['工作台', '用户与权限', '内容维护', '记录', '账户设置与管理员管理'],
  );
  for (const audience of ['user', 'admin']) {
    const html = fs.readFileSync('dist/' + audience + '/index.html', 'utf8');
    assert(html.includes('href="#' + (audience === 'user' ? 'shots' : 'overview') + '"'));
    assert(html.includes('media="print"'));
    // Layout, typography and theme must participate in the first paint. Only feature styles defer.
    const critical = [
      '/shared/base.css',
      '/shared/polish.css',
      '/style.css',
      '/visual.css',
      '/shared/liquid.css',
      ...(audience === 'user'
        ? ['/theme.css', '/header.css', '/page-layout.css']
        : ['/mobile-nav.css', '/console-layout.css']),
    ];
    const links = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
    for (const href of critical) {
      const link = links.find((tag) => tag.includes(`href="${href}"`));
      assert(link, `${audience}: missing first-paint stylesheet ${href}`);
      assert(
        !/\b(?:media|onload|disabled)\s*=/.test(link),
        `${audience}: first-paint style deferred: ${href}`,
      );
    }
    const css = fs.readFileSync('dist/' + audience + '/startup.css', 'utf8');
    assert(!css.includes('position: fixed'));
    assert(!css.includes('visibility: hidden'));
  }
  console.log(
    'PASS startup loading: small initial graphs, shared pending loads, retry after failure, HTML menus and both navigation orders.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
