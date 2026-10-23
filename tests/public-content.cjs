const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async () => {
  const requests = [],
    storage = new Map();
  let allowed = true,
    origin = 'https://isolated.example',
    pendingCopy;
  const content = {
    siteName: '项目',
    campusName: '学校',
    categories: [],
    conditions: [{ id: 'night', label: '夜色' }],
  };
  const api = {
    session: () => null,
    async request(path, method, body) {
      requests.push({ path, method, body });
      if (path === '/api/site-content') return pendingCopy || content;
      if (path === '/api/runtime') return { name: 'test', label: '测试环境' };
      if (path.startsWith('/api/announcements?'))
        return { announcement: { id: 'notice', revision: 1 } };
      return {
        show: allowed,
        announcement: { title: '仅测试公告', body: '<script>纯文本</script>' },
      };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('miniprogram/services/public-content.js', 'utf8'), {
    module,
    require(name) {
      if (name === './api') return api;
      if (name === './network') return { configuredOrigin: () => origin };
      if (name === './model') return { uuid: () => require('node:crypto').randomUUID() };
      throw Error(name);
    },
    wx: { getStorageSync: (k) => storage.get(k), setStorageSync: (k, v) => storage.set(k, v) },
    Date,
  });
  const makePage = () => ({
    route: 'pages/shots/index',
    data: { conditions: [{ id: 'night', name: '夜景' }] },
    setData(v) {
      Object.assign(this.data, v);
    },
  });
  const page = makePage();
  await module.exports.show(page);
  assert.equal(page.data.publicOverlayOpen, true);
  assert.equal(page.data.conditions[0].name, '夜色');
  assert.equal(requests.filter((r) => r.method === 'POST').length, 1);
  await module.exports.show(page);
  assert.equal(
    requests.filter((r) => r.method === 'POST').length,
    1,
    'One entry cannot claim twice',
  );
  module.exports.hide(page);
  assert.equal(page.data.publicOverlayOpen, false);
  allowed = false;
  module.exports.newVisit();
  await module.exports.show(page);
  assert.equal(page.data.announcement, null, 'The server can deny an otherwise eligible candidate');
  origin = 'https://another-isolated.example';
  // Use a separate promise holder so navigation can happen before copy is delivered.
  let resolveCopy;
  pendingCopy = new Promise((resolve) => {
    resolveCopy = resolve;
  });
  const late = makePage(),
    inFlight = module.exports.show(late);
  module.exports.hide(late);
  resolveCopy(content);
  await inFlight;
  assert.equal(
    late.data.siteContent,
    undefined,
    'Hidden pages must reject late operational responses',
  );
  const admin = fs.readFileSync('dist/admin/navigation.js', 'utf8');
  assert(admin.includes("'site-content'") && admin.includes("'announcements'"));
  const template = fs.readFileSync('miniprogram/components/site-overlay/index.wxml', 'utf8');
  assert(
    !template.includes('catchtouchmove="noop"') && template.includes('scroll-y'),
    'The modal must allow native vertical scroll gestures',
  );
  console.log(
    'PASS public content: server-controlled frequency, one popup per entry, hidden-page isolation and native overlay scroll containment.',
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
