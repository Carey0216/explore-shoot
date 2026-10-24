const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
(async () => {
  let preference = 'zh-CN',
    saves = [];
  global.location = { pathname: '/en-US/', search: '', hash: '#discover' };
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'en-GB', languages: ['en-GB'] },
    configurable: true,
  });
  global.history = {
    state: null,
    replaceState(_a, _b, path) {
      location.pathname = path.split('#')[0];
    },
  };
  const source = fs
    .readFileSync('dist/shared/localization.js', 'utf8')
    .replace(
      /^import dictionary.*;$/m,
      'const dictionary=' + fs.readFileSync('dist/shared/locales/en-US.json', 'utf8') + ';',
    )
    .replace(
      /^import\s*\{[\s\S]*?\}\s*from '\.\/preferences\.js';/m,
      "const getPreferences=()=>({language:globalThis.testPreference()}),getPreferenceAccountId=()=>null,subscribePreferences=()=>{},updatePreferences=globalThis.testSave,preferenceScope=()=> 'device';",
    )
    .replace(/^import \{ controlPopover.*;$/m, 'const controlPopover=()=>{};');
  global.testPreference = () => preference;
  global.testSave = async (patch) => {
    saves.push(patch);
    preference = patch.language;
  };
  const web = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.equal(web.effectiveLanguage(), 'en-US');
  assert.equal(preference, 'zh-CN', 'A URL override never saves an account preference');
  assert.equal(saves.length, 0);
  location.pathname = '/zh-CN/';
  assert.equal(web.effectiveLanguage('en-US'), 'zh-CN');
  location.pathname = '/';
  assert.equal(web.effectiveLanguage('system'), 'en-US');
  assert.equal(web.languageFromDevice('ja-JP'), 'zh-CN');
  assert.equal(web.languageFromDevice('en_AU'), 'en-US');
  assert.equal(web.forcedLanguage('/admin/en-US/login.html'), 'en-US');
  assert.equal(web.forcedLanguage('/zh-CN.evil/'), '');
  assert.equal(web.uiText('在校园，遇见更多美好', 'en-US'), 'Explore. Capture. Connect.');
  assert.equal(web.uiText('北方民族大学图书馆', 'en-US'), 'North Minzu University Library');
  const render = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/i18n.wxs', 'utf8'), render);
  const native = render.module.exports;
  assert.equal(native.ui('发现', 'en-US'), 'Discover');
  assert.equal(native.content('社区', 'en-US', {}, false), 'Discover');
  assert.equal(native.content('出行', 'en-US', {}, false), 'Explore');
  assert.equal(native.ui('发现', 'zh-CN'), '发现');
  assert.equal(
    native.content('原始内容', 'en-US', { 原始内容: 'Translated content' }, true),
    '原始内容',
  );
  assert.equal(
    native.content('原始内容', 'en-US', { 原始内容: 'Translated content' }, false),
    'Translated content',
  );
  assert.equal(native.content(5, 'en-US', {}, false), 5);
  const options = [{ id: 'approved', label: '已通过' }];
  assert.equal(native.options(options, 'en-US')[0].id, 'approved');
  assert.equal(options[0].label, '已通过', 'Picker translation cannot mutate canonical options');
  const auth = await import(
    'data:text/javascript;base64,' +
      Buffer.from(fs.readFileSync('dist/shared/auth-routing.js', 'utf8')).toString('base64')
  );
  assert.equal(auth.safeReturn('user', '/en-US/#place/nmu1'), '/en-US/#place/nmu1');
  assert.equal(auth.safeReturn('user', '/en-US//evil.example'), '/#discover');
  location.pathname = '/en-US/';
  assert(
    auth.authURL('user', 'login', '/#me').startsWith('/en-US/login.html?return=%2Fen-US%2F%23me'),
  );
  for (const page of [
    'dist/user/index.html',
    'dist/user/login.html',
    'dist/user/register.html',
    'dist/admin/index.html',
    'dist/admin/login.html',
  ]) {
    const html = fs.readFileSync(page, 'utf8');
    assert(html.includes('/shared/brand/jingyu-favicon.png'), page);
    assert(html.includes('景遇 · 在校园，遇见更多美好'), page);
  }
  console.log(
    'PASS v8 bilingual display: device/account/URL precedence, accurate campus labels, original content, immutable picker values, safe auth returns and brand entry points.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
