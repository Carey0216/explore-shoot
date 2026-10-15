const assert = require('node:assert/strict'),
  fs = require('node:fs');
(async () => {
  const esc = (s) =>
    String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const load = async (file, prefix = '') =>
    import(
      'data:text/javascript;base64,' +
        Buffer.from(
          prefix + fs.readFileSync(file, 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, ''),
        ).toString('base64')
    );
  global.__passport = { esc };
  const atlas = await load('dist/shared/passport-atlas.js', 'const {esc}=globalThis.__passport;');
  const b = {
    id: 'photo:east-01',
    frame: 'photo',
    name: '<楼宇>',
    outline: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    holes: [
      [
        [2, 2],
        [4, 2],
        [4, 4],
      ],
    ],
    pointIds: [],
    collected: false,
  };
  const html = atlas.atlasHTML(
    { buildings: [b], photoWidth: 822, photoHeight: 1657, photoURL: '/shared/photo.jpg' },
    'photo',
  );
  assert(html.includes('clip-rule="evenodd"') && html.includes('clip-path='));
  assert(
    html.includes('viewBox="0 0 1657 822"'),
    'Landscape viewing frame does not alter source pixels',
  );
  assert(html.includes('&lt;楼宇>') && !html.includes('<楼宇>'));
  assert.equal(
    atlas.buildingPath(b).split('Z').length,
    3,
    'Courtyards remain holes in individually clipped roofs',
  );
  let resolve;
  const host = { innerHTML: '', isConnected: true };
  global.__passport = {
    esc,
    api: () => new Promise((yes) => (resolve = yes)),
    $: () => host,
    modal() {},
    toast() {},
    atlasHTML: atlas.atlasHTML,
    bindAtlas() {},
  };
  const p = await load(
    'dist/user/passport.js',
    'const {esc,api,$,modal,toast,atlasHTML,bindAtlas}=globalThis.__passport;',
  );
  const state = { account: { id: 'a' } };
  const unmount = p.mountPassport(host, { state });
  const before = host.innerHTML;
  state.account = { id: 'b' };
  resolve({ achievements: [{ earned: true, title: 'PRIVATE achievement' }] });
  await new Promise((yes) => setImmediate(yes));
  assert.equal(
    host.innerHTML,
    before,
    'Private progress from an old account must not populate another account',
  );
  unmount();
  const ui = await import(
    'data:text/javascript;base64,' + fs.readFileSync('dist/shared/ui.js').toString('base64')
  );
  assert.equal(ui.thumbnail('/media/abc'), '/media/abc?size=thumb');
  assert.equal(ui.thumbnail('/api/works/abc/photo?x=1'), '/api/works/abc/photo?x=1&size=thumb');
  assert.equal(ui.thumbnail('data:image/jpeg;base64,abc'), 'data:image/jpeg;base64,abc');
  delete global.__passport;
  console.log(
    'PASS passport: individual roof masks and holes, escaped names, rotated image frame, stale-account progress guard and same-route thumbnails.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
