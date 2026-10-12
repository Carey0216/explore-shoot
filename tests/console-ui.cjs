const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
(async () => {
  const uri = (p) =>
    'data:text/javascript;base64,' + Buffer.from(fs.readFileSync(p, 'utf8')).toString('base64');
  const presets = await import(uri('dist/shared/avatar-presets.js'));
  assert.equal(presets.avatarPresets.length, 20);
  assert.equal(new Set(presets.avatarPresets.map((x) => x.id)).size, 20);
  for (const x of presets.avatarPresets) {
    const svg = fs.readFileSync('dist/shared/avatars/' + x.id + '.svg', 'utf8');
    assert(svg.includes('viewBox="0 0 128 128"'));
    assert(!/<script|href=|onload=/i.test(svg));
    assert(
      fs
        .readFileSync('backend/src/main/java/cn/campus/auth/AvatarPresets.java', 'utf8')
        .includes('"' + x.id + '"'),
    );
  }
  const profile = fs
    .readFileSync('dist/shared/profile.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  global.__presetTest = { ...presets, esc: (s) => String(s) };
  const mod = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const {avatarPresets,presetAvatar,presetURL,esc}=globalThis.__presetTest;' + profile,
      ).toString('base64')
  );
  const html = mod.presetPickerHTML({ avatarPreset: 'panda' });
  const split = html.indexOf('id="avatar-presets-extra"');
  assert.equal((html.slice(0, split).match(/data-avatar-preset=/g) || []).length, 5);
  assert.equal((html.slice(split).match(/data-avatar-preset=/g) || []).length, 15);
  assert(html.includes('aria-expanded="false"'));
  assert(html.includes('aria-pressed="true"'));
  const nav = await import(uri('dist/admin/navigation.js'));
  assert.equal(nav.adminGroups.length, 5);
  assert.equal(nav.currentGroup('applications').id, 'users');
  assert.equal(nav.currentGroup('admins').id, 'settings');
  assert.equal(nav.currentGroup('reports').id, 'points');
  const timers = new Map(),
    els = {};
  let id = 0,
    removed = false,
    reloaded = false;
  const element = () => ({
    classList: {
      add() {},
      remove() {
        removed = true;
      },
    },
    setAttribute() {},
    remove() {},
    hidden: true,
  });
  for (const key of ['admin-startup', 'admin-startup-status', 'admin-startup-retry'])
    els[key] = element();
  const context = {
    document: { getElementById: (k) => els[k], body: element() },
    window: {},
    setTimeout: (fn, ms) => {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    location: {
      reload() {
        reloaded = true;
      },
    },
  };
  vm.runInNewContext(fs.readFileSync('dist/admin/startup.js', 'utf8'), context);
  [...timers.values()].find((x) => x.ms === 15000).fn();
  assert.equal(els['admin-startup-retry'].hidden, false);
  els['admin-startup-retry'].onclick();
  assert(reloaded);
  context.window.adminStartup.ready();
  assert(removed);
  assert.equal(timers.size, 1);
  const pending = [];
  let renders = 0;
  global.__recordTest = {
    api: () => new Promise((resolve) => pending.push(resolve)),
    esc: String,
    date: String,
    $: () => null,
    toast: () => {},
  };
  const auditSource = fs
    .readFileSync('dist/admin/pages/audit.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  const { createAuditPages } = await import(
    'data:text/javascript;base64,' +
      Buffer.from('const {api,esc,date,$,toast}=globalThis.__recordTest;' + auditSource).toString(
        'base64',
      )
  );
  const state = {
    page: 'audit',
    auditFilters: { kind: 'audit', category: 'all', role: 'all', q: 'first', from: '', to: '' },
  };
  const audit = createAuditPages({
    state,
    render: () => renders++,
    role: String,
    table: () => '',
    badge: String,
  });
  const first = audit.loadAudit();
  state.auditFilters.q = 'second';
  const second = audit.loadAudit();
  pending[1]({ events: [{ id: 'new' }], total: 1, nextBefore: null });
  await second;
  pending[0]({ events: [{ id: 'old' }], total: 1, nextBefore: null });
  await first;
  assert.equal(state.auditEvents[0].id, 'new');
  assert.equal(renders, 1);
  const late = audit.loadAudit();
  state.page = 'points';
  pending[2]({ events: [{ id: 'wrong-page' }], total: 1, nextBefore: null });
  await late;
  assert.equal(state.auditEvents[0].id, 'new');
  assert.equal(renders, 1);
  delete global.__recordTest;
  delete global.__presetTest;
  console.log(
    'PASS console UI: twenty original safe assets, five quick picks, expanded selection, shared navigation groups, startup timeout/retry/ready.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
