const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
(async () => {
  const source = fs
    .readFileSync('dist/shared/rich-message.js', 'utf8')
    .replace(/^import .*;\r?\n/, '');
  const rich = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  for (const x of [
    'javascript:alert(1)',
    '//evil.test',
    '#unknown',
    'https://u:password@example.test',
    'data:text/html,test',
  ])
    assert.equal(rich.safeTarget(x), '');
  for (const x of [
    '#publish',
    '#contact',
    '#topic/abc',
    '#conversation/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'https://example.test/help',
  ])
    assert(rich.safeTarget(x));
  const store = new Map([
      ['explore-mini-session-v1', { token: 'b'.repeat(64), account: { id: 'USER' } }],
    ]),
    requests = [];
  let origin = 'https://campus.example.test';
  const wx = {
    getStorageSync: (k) => store.get(k),
    setStorageSync: (k, v) => store.set(k, v),
    removeStorageSync: (k) => store.delete(k),
    getFileSystemManager: () => ({ unlink() {} }),
    request: (o) => requests.push(o),
  };
  const module = { exports: {} };
  vm.runInNewContext(
    '(function(require,module,wx){' +
      fs.readFileSync('miniprogram/services/admin-api.js', 'utf8') +
      '})',
    {},
  )(
    () => ({ backendOrigin: () => origin, configuredOrigin: () => origin, failure: (e) => e }),
    module,
    wx,
  );
  const a = module.exports;
  a.saveSession({
    token: 'a'.repeat(64),
    expiresAt: Date.now() + 100000,
    account: { id: 'ADMIN' },
  });
  let p = a.request('/inbox');
  let r = requests.pop();
  assert.equal(r.url, origin + '/admin/api/mini/admin/inbox');
  assert.equal(r.header.Authorization, 'Bearer ' + 'a'.repeat(64));
  r.success({ statusCode: 200, data: { unread: 1 } });
  assert.equal((await p).unread, 1);
  assert.equal(store.get('explore-mini-session-v1').account.id, 'USER');
  p = a.request('/inbox');
  r = requests.pop();
  origin = 'https://other.example.test';
  assert.equal(a.session(), null);
  r.success({ statusCode: 200, data: { private: 'old' } });
  await assert.rejects(p, /账号已改变/);
  p = a.request('/inbox');
  r = requests.pop();
  assert(!r.header.Authorization);
  r.success({ statusCode: 401, data: { error: '请登录' } });
  await assert.rejects(p, /请登录/);
  assert.throws(() => a.request('/unregistered-module'), /不支持/);
  p = a.request('/features');
  r = requests.pop();
  assert.equal(r.url, origin + '/admin/api/mini/admin/features');
  r.success({ statusCode: 403, data: { error: '仅顶管可修改' } });
  await assert.rejects(p, /仅顶管/);
  console.log(
    'v7.1.1 safe notification links, native administrator audience, cross-backend session invalidation and stale response rejection passed.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
