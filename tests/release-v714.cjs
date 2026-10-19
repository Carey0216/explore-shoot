const assert = require('node:assert/strict'),
  fs = require('node:fs');
const load = async (file, bindings = {}) => {
  const source = fs.readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  global.__v714Bindings = bindings;
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(
        'const {' + Object.keys(bindings).join(',') + '}=globalThis.__v714Bindings;\n' + source,
      ).toString('base64')
  );
};
(async () => {
  const { readChat } = await load('dist/user/support-chat.js');
  const storage = new Map();
  const local = { getItem: (k) => storage.get(k) };
  storage.set(
    'explore-support-chat-v1:a',
    JSON.stringify({
      turns: [
        { role: 'user', content: '上一轮' },
        { role: 'assistant', content: '回复' },
        { role: 'user', content: '断网中的问题' },
      ],
      input: '',
      pendingQuestion: '断网中的问题',
    }),
  );
  const restored = readChat(local, 'a');
  assert.equal(restored.turns.length, 2);
  assert.equal(restored.input, '断网中的问题');
  assert.equal(readChat(local, 'b').turns.length, 0);
  assert.deepEqual(
    readChat(
      {
        getItem() {
          throw Error('disabled');
        },
      },
      'a',
    ),
    { turns: [], input: '' },
  );
  const { assistantAvatars, assistantAvatar } = await load('dist/shared/assistant-avatars.js');
  assert.equal(Object.keys(assistantAvatars).length, 5);
  assert.equal(new Set(Object.keys(assistantAvatars).map(assistantAvatar)).size, 5);
  const { chatBubble } = await load('dist/shared/chat.js', {
    esc: (s) => String(s ?? '').replaceAll('<', '&lt;'),
    date: (s) => s,
    icon: () => '',
    richHTML: (m) => '<p>' + String(m.body).replaceAll('<', '&lt;') + '</p>',
  });
  const message = { id: 'a', from: 'admin', body: '<script>', createdAt: '2026-10-19T12:00:00Z' };
  const thread = { adminName: '管理员', userName: '同学', userReadAt: '2026-10-19T13:00:00Z' };
  assert(chatBubble(message, 'user', thread).includes('incoming'));
  assert(chatBubble(message, 'admin', thread).includes('outgoing'));
  assert(chatBubble(message, 'admin', thread).includes('已读'));
  assert(!chatBubble(message, 'admin', thread).includes('<script>'));
  const ui = await load('dist/shared/ui.js');
  global.location = { href: 'http://127.0.0.1:9999/' };
  const requests = [];
  global.XMLHttpRequest = class {
    constructor() {
      this.upload = {};
      requests.push(this);
    }
    open() {}
    setRequestHeader() {}
    send() {}
    abort() {
      this.onabort();
    }
  };
  const first = ui.uploadPhoto('data:image/jpeg;base64,a');
  const abort = new AbortController();
  const cancelled = ui.uploadPhoto('data:image/jpeg;base64,b', { signal: abort.signal });
  const last = ui.uploadPhoto('data:image/jpeg;base64,c');
  assert.equal(requests.length, 1);
  abort.abort();
  await assert.rejects(cancelled, (e) => e.name === 'AbortError');
  requests[0].status = 201;
  requests[0].responseText = '{"id":"first"}';
  requests[0].onload();
  await first;
  assert.equal(requests.length, 2);
  requests[1].status = 201;
  requests[1].responseText = '{"id":"last"}';
  requests[1].onload();
  assert.equal((await last).id, 'last');
  const page = fs.readFileSync('dist/user/pages/account.js', 'utf8'),
    css = fs.readFileSync('dist/shared/surfaces.css', 'utf8');
  assert(page.includes('role="tablist"'));
  assert(!page.includes('我的探索手记</h3>'));
  assert(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'));
  assert(fs.readFileSync('dist/shared/ui.js', 'utf8').includes('capture="environment"'));
  assert(!fs.existsSync('dist/admin/pages/invites.js'));
  const events = {};
  global.location = { hash: '#me' };
  global.window = {
    scrollY: 0,
    addEventListener: (name, fn) => (events[name] = fn),
    scrollTo: (x, y) => (window.scrollY = y),
  };
  global.document = {
    addEventListener() {},
    getElementById: () => ({}),
    querySelectorAll: () => [],
  };
  global.MutationObserver = class {
    observe() {}
  };
  global.requestAnimationFrame = (callback) => callback();
  const back = await load('dist/user/context-back.js');
  back.installContextBack();
  const state = { query: '楼', theme: '全部' };
  window.scrollY = 325;
  events.scroll();
  location.hash = '#place/p';
  window.scrollY = 0; // Browser resets before hashchange.
  back.rememberList(state);
  back.restoreState(state);
  back.restoreList(location.hash);
  events.scroll();
  location.hash = '#me';
  back.rememberList(state);
  back.restoreState(state);
  back.restoreList(location.hash);
  assert.equal(window.scrollY, 325);
  assert.equal(state.query, '楼');
  for (const file of ['dist/admin/pages/messages.js', 'dist/user/inbox.js', 'dist/shared/auth.js'])
    assert(!/免打扰|inviteCode/.test(fs.readFileSync(file, 'utf8')));
  console.log(
    'PASS v7.1.4 local/account-separated assistant recovery, five avatars, directional chat receipts, serialized upload queue/cancellation, native camera and retired UI.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
