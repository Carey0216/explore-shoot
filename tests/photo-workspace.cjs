const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const source = fs.readFileSync('dist/admin/overview-loader.js', 'utf8');
  const { createOverviewLoader, needsFullOverview } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const requests = [],
    loader = createOverviewLoader(
      (path) => new Promise((resolve) => requests.push({ path, resolve })),
    );
  loader.reset('first');
  const compact = loader.load(false),
    full = loader.load(true);
  assert.equal(requests.length, 2);
  assert(requests[0].path.includes('compact'));
  assert(!requests[1].path.includes('compact'));
  requests[0].resolve({ summary: {} });
  await compact;
  requests[1].resolve({ users: [{ id: 'visible-on-first-entry' }] });
  assert.equal((await full).users.length, 1);
  assert.equal((await loader.load(true)).users.length, 1);
  const stale = loader.load(true, true);
  loader.reset('second');
  const next = loader.load(true);
  requests[2].resolve({ users: [{ id: 'private-old-account' }] });
  await assert.rejects(stale, /账号已改变/);
  requests[3].resolve({ users: [] });
  assert.equal((await next).users.length, 0);
  const oldPoll = loader.load(true, true),
    savedRefresh = loader.load(true, true);
  requests[5].resolve({ users: [{ id: 'after-edit' }] });
  await savedRefresh;
  requests[4].resolve({ users: [{ id: 'before-edit' }] });
  await oldPoll;
  assert.equal(
    (await loader.load(true)).users[0].id,
    'after-edit',
    'A late poll must not replace the fresh post-edit cache',
  );
  assert(needsFullOverview('users'));
  assert(needsFullOverview('admins'));
  assert(!needsFullOverview('overview'));
  const core = require('../miniprogram/services/album-export-core');
  assert.equal(
    fs.readFileSync('dist/shared/album-export-core.js', 'utf8'),
    fs.readFileSync('miniprogram/services/album-export-core.js', 'utf8'),
  );
  const context = { measureText: (t) => ({ width: Array.from(t).length * 17 }) };
  const album = {
    title: '一学期的校园',
    message: '主动选择的照片',
    items: [{ place: '图书馆', date: '2026-10-24T09:00:00Z', caption: '很长的留言'.repeat(20) }],
  };
  const layout = core.layout(context, album, album.items);
  assert(layout.cells[0].caption.length > 3);
  assert(layout.height > layout.cells[0].y + layout.cells[0].height);
  const bytes = core.pdf([{ jpeg: new Uint8Array([255, 216, 255, 217]), width: 640, height: 900 }]);
  const text = Buffer.from(bytes).toString('latin1');
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  for (const m of text.slice(xref).matchAll(/(\d{10}) 00000 n/g)) {
    const at = Number(m[1]);
    assert(/^\d+ 0 obj/.test(text.slice(at)));
  }
  assert(!text.includes('ownerId'));
  assert.throws(() => core.pdf([]));
  const menu = fs.readFileSync('dist/shared/account-menu.js', 'utf8');
  assert(menu.includes('onProfile'));
  assert(fs.readFileSync('dist/admin/app.js', 'utf8').includes('bindAccountMenu({'));
  const startup = fs
    .readFileSync('dist/user/index.html', 'utf8')
    .match(/id="startup"[\s\S]*?<\/section>/)[0];
  assert(!startup.includes('campus-brand'), 'Startup must not repeat the header logo');
  assert(startup.includes('startup-dots'));
  console.log(
    'PASS photo workspace: independent full/compact caches, first-entry users, account race isolation, shared export layout and PDF xref offsets, shared account menu and single-brand loading.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
