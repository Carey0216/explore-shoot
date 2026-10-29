const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  let definition,
    owner = 'alice';
  const calls = [];
  const admin = {
    session: () => ({ account: { id: owner } }),
    request(path, method, body) {
      return new Promise((resolve, reject) => calls.push({ path, method, body, resolve, reject }));
    },
  };
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/admin-tasks/index.js', 'utf8'), {
    Page(value) {
      definition = value;
    },
    require(name) {
      return name.endsWith('/admin-api')
        ? admin
        : name.endsWith('/network')
          ? { configuredOrigin: () => 'https://test.example' }
          : { pageOptions: (value) => value };
    },
    wx: { showToast() {} },
  });
  const page = {
    ...definition,
    nativeVisible: true,
    data: {
      ...definition.data,
      topics: [{ id: 'topic', revision: 3 }],
      selected: { topic: true },
      action: 3,
      description: 'first',
    },
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  const preview = {
    confirmation: 'checked',
    changes: [{ id: 'topic', before: { description: 'old' }, after: { description: 'first' } }],
  };
  const pending = page.review();
  page.field({ currentTarget: { dataset: { key: 'description' } }, detail: { value: 'newer' } });
  calls[0].resolve(preview);
  await pending;
  assert.equal(
    page.data.preview,
    null,
    'An edit made while previewing invalidates the late result',
  );
  assert.equal(page.pendingBody, null);
  assert.equal(page.data.busy, false);
  const next = page.review();
  calls[1].resolve(preview);
  await next;
  assert(page.data.preview);
  page.field({ currentTarget: { dataset: { key: 'description' } }, detail: { value: 'newest' } });
  await page.apply();
  assert.equal(calls.length, 2, 'Editing after preview requires a new preview before apply');
  const oldOwner = page.review();
  owner = 'bob';
  const refresh = page.load();
  calls[3].resolve({ topics: [], tasks: [], reminders: [] });
  await refresh;
  calls[2].resolve(preview);
  await oldOwner;
  assert.equal(
    page.data.preview,
    null,
    'Old-account previews cannot replace the new account workspace',
  );
  assert.equal(page.pendingBody, null);
  assert.equal(page.data.busy, false);
  console.log(
    'PASS admin task preview: edits invalidate confirmation and late account responses are discarded.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
