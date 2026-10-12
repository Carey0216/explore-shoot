const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const storage = new Map(),
    events = new Map();
  let blocked = false;
  global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => {
      if (blocked) throw Error('blocked');
      storage.set(k, v);
    },
  };
  global.window = {
    addEventListener: (k, v) => events.set(k, v),
    dispatchEvent: (e) => events.get(e.type)?.(e),
  };
  const m = await import(
    'data:text/javascript;base64,' +
      Buffer.from(fs.readFileSync('dist/shared/preferences.js', 'utf8')).toString('base64')
  );
  await m.updatePreferences({ language: 'en', voiceId: 'zhou' });
  assert.equal(m.preferenceScope(), 'device');
  const local = storage.get('explore-guest-preferences-v1');
  blocked = true;
  await assert.rejects(m.updatePreferences({ language: 'ja' }), /浏览器/);
  assert.equal(m.getPreferences().language, 'en');
  blocked = false;
  for (const bad of [{ role: 'super' }, { language: 'fr' }, { mapFollow: 1 }, [], {}])
    await assert.rejects(m.updatePreferences(bad), /无效/);
  m.setPreferenceAccount({ id: 'a', preferences: { language: 'ja' }, preferencesRevision: 2 });
  assert.equal(m.getPreferences().language, 'ja');
  assert.equal(storage.get('explore-guest-preferences-v1'), local);
  let remote = { ...m.getPreferences() },
    rev = 2,
    calls = [];
  global.fetch = async (url, opt) => {
    assert.equal(url, '/api/auth/preferences');
    assert.equal(opt.credentials, 'same-origin');
    const patch = JSON.parse(opt.body);
    calls.push(patch);
    remote = { ...remote, ...patch };
    return { ok: true, json: async () => ({ preferences: remote, revision: ++rev }) };
  };
  await Promise.all([
    m.updatePreferences({ motion: 'reduce' }),
    m.updatePreferences({ textSize: 'large' }),
  ]);
  assert.equal(m.getPreferences().motion, 'reduce');
  assert.equal(m.getPreferences().textSize, 'large');
  assert.equal(calls.length, 2);
  m.setPreferenceAccount({ id: 'a', preferences: { language: 'zh-CN' }, preferencesRevision: 2 });
  assert.equal(
    m.getPreferences().language,
    'ja',
    'A stale auth poll cannot overwrite saved preferences',
  );
  m.setPreferenceAccount({
    id: 'a',
    preferences: { ...remote, language: 'zh-TW' },
    preferencesRevision: 8,
  });
  assert.equal(m.getPreferences().language, 'zh-TW');
  global.fetch = async () => {
    throw Error('offline');
  };
  await assert.rejects(m.updatePreferences({ language: 'en' }), /网络/);
  assert.equal(m.getPreferences().language, 'zh-TW');
  assert.equal(storage.get('explore-guest-preferences-v1'), local);
  let finish;
  global.fetch = () => new Promise((resolve) => (finish = resolve));
  const pending = m.updatePreferences({ language: 'en' });
  await new Promise((r) => setImmediate(r));
  m.setPreferenceAccount({ id: 'b', preferences: { language: 'zh-CN' }, preferencesRevision: 0 });
  finish({ ok: true, json: async () => ({ preferences: { language: 'en' }, revision: 9 }) });
  await assert.rejects(pending, /账号已变化/);
  assert.equal(m.getPreferences().language, 'zh-CN');
  m.setPreferenceAccount(null);
  assert.equal(m.getPreferences().language, 'en');
  assert.equal(m.getPreferences().voiceId, 'zhou');
  m.setPreferenceAccount({ id: 'a', preferences: { language: 'ja' }, preferencesRevision: 2 });
  let expired = false;
  events.set('preferences:unauthorized', () => (expired = true));
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: '请登录' }) });
  await assert.rejects(m.updatePreferences({ language: 'en' }), /请登录/);
  assert(expired);
  assert.equal(m.preferenceScope(), 'device');
  assert.equal(m.getPreferences().language, 'en');
  console.log(
    'PASS: preferences client; guest/account separation, blocked storage, serialized saves, failed confirmation, stale revisions, switching accounts and session expiry.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
