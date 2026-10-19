const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const source = fs
    .readFileSync('dist/user/shooting.js', 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '');
  let resolve;
  const host = { isConnected: true, innerHTML: 'original' };
  global.__shootingTest = {
    api: () => new Promise((yes) => (resolve = yes)),
    esc: (s) =>
      String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    date: () => '',
    experienceHTML: () => '',
    featureVisible: () => true,
    thumbnail: (s) => s + '?size=thumb',
    conditionLabels: {},
    icon: () => '',
    toast: () => {},
    modal: () => {},
    closeModal: () => {},
    formSubmit: () => {},
    errorHTML: '',
    $: () => host,
  };
  const module = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const {api,esc,date,icon,toast,modal,closeModal,formSubmit,errorHTML,$,thumbnail,conditionLabels,experienceHTML,featureVisible}=globalThis.__shootingTest;' +
          fs.readFileSync('dist/user/inbox.js', 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, '') +
          source,
      ).toString('base64')
  );
  assert.equal(module.safePhoto('javascript:alert(1)'), '');
  assert.equal(module.safePhoto('/media/private-photo'), '');
  assert.equal(module.safePhoto('https://external.example/photo'), '');
  assert.equal(module.safePhoto('/api/works/1234-abcd/photo'), '/api/works/1234-abcd/photo');
  const html = module.workCardHTML({
    id: 'abc',
    caption: '<script>bad</script>',
    authorName: '<img src=x>',
    photo: '/api/works/1234-abcd/photo',
    location: { lat: 38 },
    note: 'PRIVATE',
  });
  assert(!html.includes('<script>') && !html.includes('<img src=x>') && !html.includes('PRIVATE'));
  const dispose = module.mountCheckinSharing(host, { point: { id: 'nmu1' } });
  dispose();
  resolve({ spots: [{ id: 'spot1', title: 'example' }] });
  await new Promise((yes) => setImmediate(yes));
  assert.equal(host.innerHTML, 'original', 'Late position response cannot alter a closed check-in');
  const state = { page: 'notifications', account: { id: 'alice' } };
  const unmount = module.mountShootingPage({ state, requireAccount: async () => true });
  state.account = { id: 'bob' };
  resolve({ items: [{ title: 'PRIVATE notification' }] });
  await new Promise((yes) => setImmediate(yes));
  assert.equal(
    host.innerHTML,
    'original',
    'Old account notifications cannot be rendered for another account',
  );
  unmount();
  delete global.__shootingTest;
  console.log(
    'PASS shooting community: safe photo routes, escaped public captions, private fields excluded, disposed check-in and stale-account inbox responses.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
