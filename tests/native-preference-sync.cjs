const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
(async () => {
  let session = { token: 'test', account: { id: 'first', preferences: { language: 'zh-CN' } } },
    resolveRefresh;
  const client = {
    session: () => session,
    updateAccount: (value) => {
      session = { ...session, account: value };
    },
    request: (_path, method, patch) =>
      method === 'PATCH'
        ? Promise.resolve({
            preferences: { ...session.account.preferences, ...patch },
            revision: 4,
          })
        : new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/appearance.js', 'utf8'), {
    module,
    require: (name) =>
      name === './network' ? { configuredOrigin: () => 'https://test.example' } : client,
    wx: { getStorageSync() {}, setStorageSync() {}, getAppBaseInfo: () => ({ theme: 'light' }) },
  });
  const appearance = module.exports;
  appearance.account(session.account);
  let pending = appearance.refresh();
  resolveRefresh({ account: { id: 'first', preferences: { language: 'en-US' } } });
  await pending;
  assert.equal(
    appearance.snapshot().preferences.language,
    'en-US',
    'A refreshed account picks up the other client’s language',
  );
  pending = appearance.refresh();
  await appearance.update({ language: 'zh-CN' });
  resolveRefresh({ account: { id: 'first', preferences: { language: 'en-US' } } });
  await pending;
  assert.equal(
    appearance.snapshot().preferences.language,
    'zh-CN',
    'A delayed refresh cannot undo a more recent selection',
  );
  appearance.account({ id: 'first', preferences: { language: 'en-US' }, preferencesRevision: 3 });
  assert.equal(
    appearance.snapshot().preferences.language,
    'zh-CN',
    'A retained page cannot reapply an older account preference',
  );
  pending = appearance.refresh();
  session = { token: 'next', account: { id: 'second', preferences: { language: 'zh-CN' } } };
  appearance.account(session.account);
  resolveRefresh({ account: { id: 'first', preferences: { language: 'en-US' } } });
  await pending;
  assert.equal(session.account.id, 'second');
  assert.equal(appearance.snapshot().preferences.language, 'zh-CN');
  console.log(
    'PASS native preference sync: cross-client refresh, newer selection protection and stale-account isolation.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
