const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  let preferences,
    account = 'first',
    calls = [],
    pending = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/localization.js', 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (name === './appearance')
        return {
          subscribe(fn) {
            preferences = fn;
            fn({ preferenceScope: 'test:user:first', preferences: { language: 'en-US' } });
          },
        };
      if (name === './locale-catalogue') return { 发现: 'Discover' };
      if (name === './locale-display-fields') return [];
      if (name === './locale-page-titles') return {};
      if (name === './network') return { configuredOrigin: () => 'test' };
      if (name === './api' || name === './admin-api')
        return {
          session: () => ({ account: { id: account } }),
          request: (_path, _method, data) => {
            if (_path === '/api/localization/editorial') return Promise.resolve({ entries: {} });
            calls.push(data.texts);
            return new Promise((resolve) =>
              pending.push(() =>
                resolve({ texts: data.texts.map((text) => 'Translated ' + text) }),
              ),
            );
          },
        };
      throw Error(name);
    },
    wx: { getAppBaseInfo: () => ({ language: 'en' }) },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  const localization = module.exports;
  function create(title) {
    const patches = [];
    const page = {
      data: { title },
      setData(patch) {
        patches.push(patch);
        Object.assign(this.data, patch);
      },
    };
    const definition = localization.page({});
    definition.onLoad.call(page);
    return { page, definition, patches };
  }
  const first = create('第一页面'),
    second = create('第二页面');
  const result = localization.translate(['第一页面', '第二页面']);
  await new Promise((resolve) => setImmediate(resolve));
  pending.shift()();
  await result;
  localization.toggleOriginal();
  assert.deepEqual(Object.keys(first.page.data.localeTranslations), ['第一页面']);
  assert.deepEqual(Object.keys(second.page.data.localeTranslations), ['第二页面']);
  first.definition.onHide.call(first.page);
  const before = first.patches.length;
  localization.toggleOriginal();
  localization.toggleOriginal();
  assert.equal(first.patches.length, before, 'Hidden tabs receive no translation bridge patches');
  first.definition.onShow.call(first.page);
  assert.equal(
    first.page.data.localeOriginal,
    true,
    'A returning tab catches up with current display state',
  );

  const stale = localization.translate(['上一账号私密内容']);
  await new Promise((resolve) => setImmediate(resolve));
  account = 'second';
  preferences({ preferenceScope: 'test:user:second', preferences: { language: 'en-US' } });
  assert.equal(Object.keys(first.page.data.localeTranslations).length, 0);
  const count = calls.length;
  await new Promise((resolve) => setImmediate(resolve));
  pending.shift()();
  assert.equal(
    (await stale)[0],
    '上一账号私密内容',
    'Old account response cannot enter the new account cache',
  );
  localization.toggleOriginal();
  assert.equal(calls.length, count, 'Account switching never queues old page contents again');
  assert.equal(Object.keys(first.page.data.localeTranslations).length, 0);
  first.definition.onUnload.call(first.page);
  second.definition.onUnload.call(second.page);
  console.log(
    'PASS native localization: per-page bridge payloads, hidden-tab suspension, visible state recovery and stale-account response isolation.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
