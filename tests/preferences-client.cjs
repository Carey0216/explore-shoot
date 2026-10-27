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
  await m.updatePreferences({ textSize: 'large', voiceId: 'zhou', appearance: 'dark' });
  assert.equal(m.preferenceScope(), 'device');
  assert.equal(m.getPreferences().appearance, 'dark');
  const local = storage.get('explore-guest-preferences-v1');
  blocked = true;
  await assert.rejects(m.updatePreferences({ textSize: 'standard' }), /浏览器/);
  assert.equal(m.getPreferences().textSize, 'large');
  blocked = false;
  for (const bad of [
    { role: 'super' },
    { language: 'en' },
    { appearance: 'night' },
    { mapFollow: 1 },
    [],
    {},
  ])
    await assert.rejects(m.updatePreferences(bad), /无效/);
  m.setPreferenceAccount({
    id: 'a',
    preferences: { textSize: 'standard' },
    preferencesRevision: 2,
  });
  assert.equal(m.getPreferences().textSize, 'standard');
  assert.equal(
    m.getPreferences().appearance,
    'system',
    'A new account follows the system instead of importing guest overrides',
  );
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
    m.updatePreferences({ mapFollow: false }),
    m.updatePreferences({ textSize: 'large' }),
  ]);
  assert.equal(m.getPreferences().mapFollow, false);
  assert.equal(Object.hasOwn(m.getPreferences(), 'motion'), false);
  assert.equal(m.getPreferences().textSize, 'large');
  assert.equal(calls.length, 2);
  m.setPreferenceAccount({
    id: 'a',
    preferences: { textSize: 'standard' },
    preferencesRevision: 2,
  });
  assert.equal(
    m.getPreferences().textSize,
    'large',
    'A stale auth poll cannot overwrite saved preferences',
  );
  m.setPreferenceAccount({
    id: 'a',
    preferences: { ...remote, textSize: 'standard' },
    preferencesRevision: 8,
  });
  assert.equal(m.getPreferences().textSize, 'standard');
  global.fetch = async () => {
    throw Error('offline');
  };
  await assert.rejects(m.updatePreferences({ textSize: 'large' }), /网络/);
  assert.equal(m.getPreferences().textSize, 'standard');
  assert.equal(storage.get('explore-guest-preferences-v1'), local);
  let finish;
  global.fetch = () => new Promise((resolve) => (finish = resolve));
  const pending = m.updatePreferences({ textSize: 'large' });
  await new Promise((r) => setImmediate(r));
  m.setPreferenceAccount({
    id: 'b',
    preferences: { textSize: 'standard' },
    preferencesRevision: 0,
  });
  finish({ ok: true, json: async () => ({ preferences: { textSize: 'large' }, revision: 9 }) });
  await assert.rejects(pending, /账号已变化/);
  assert.equal(m.getPreferences().textSize, 'standard');
  m.setPreferenceAccount(null);
  assert.equal(m.getPreferences().textSize, 'large');
  assert.equal(m.getPreferences().voiceId, 'zhou');
  m.setPreferenceAccount({
    id: 'a',
    preferences: { textSize: 'standard' },
    preferencesRevision: 2,
  });
  let expired = false;
  events.set('preferences:unauthorized', () => (expired = true));
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: '请登录' }) });
  await assert.rejects(m.updatePreferences({ textSize: 'large' }), /请登录/);
  assert(expired);
  assert.equal(m.preferenceScope(), 'device');
  assert.equal(m.getPreferences().textSize, 'large');
  console.log(
    'PASS: preferences client; guest/account separation, blocked storage, serialized saves, failed confirmation, stale revisions, switching accounts and session expiry.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
