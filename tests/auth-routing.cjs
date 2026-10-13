const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
(async () => {
  const { safeReturn, authURL } = await import(
    'data:text/javascript;base64,' +
      fs.readFileSync(path.join(__dirname, '../dist/shared/auth-routing.js')).toString('base64')
  );
  for (const value of [
    'https://evil.example',
    '//evil.example',
    '/login.html',
    '/register.html',
    '/#admins',
    '/#routes?redirect=https://evil.example',
    null,
    123,
  ])
    assert.equal(safeReturn('user', value), '/#shots');
  assert.equal(safeReturn('user', '/#search'), '/#search');
  assert.equal(safeReturn('user', '/#navigate'), '/#navigate');
  assert.equal(safeReturn('user', '/#publish'), '/#publish');
  assert.equal(safeReturn('user', '/#active'), '/#active');
  assert.equal(safeReturn('admin', '/#invites'), '/#invites');
  assert.equal(safeReturn('admin', '/#campus-map'), '/#campus-map');
  assert.equal(safeReturn('admin', '/#publish'), '/#overview');
  for (const value of ['/#shots', '/#passport', '/#place/nmu1', '/#checkin/nmu1?shot=nt1'])
    assert.equal(safeReturn('user', value), value);
  for (const value of [
    '/#checkin/../admins',
    '/#checkin/nmu1?redirect=https://evil.example',
    '/#checkin/nmu1%0a',
    '/#checkin/nmu1?shot=../../bad',
  ])
    assert.equal(safeReturn('user', value), '/#shots');
  assert.equal(safeReturn('admin', '/#checkin/nmu1'), '/#overview');
  const user = new URL(authURL('user', 'register', '/#routes'), 'https://explore.example');
  assert.equal(user.pathname, '/register.html');
  assert.equal(user.searchParams.get('return'), '/#routes');
  const admin = new URL(authURL('admin', 'register', '/#users'), 'https://admin.example');
  assert.equal(admin.pathname, '/login.html');
  assert.equal(admin.searchParams.get('return'), '/#users');
  console.log(
    'Auth routing checks passed: independent pages, return destination preservation, no administrator registration and external redirect rejection.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
