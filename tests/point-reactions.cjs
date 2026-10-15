const assert = require('node:assert/strict');
const fs = require('node:fs');
const moduleURL = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
(async () => {
  const { sortNearby, dislikedLast } = await import(
    moduleURL(fs.readFileSync('dist/user/checkin-model.js', 'utf8'))
  );
  const near = { id: 'near', lng: 106, lat: 38, myReaction: 'dislike' };
  const far = { id: 'far', lng: 107, lat: 39 };
  const original = [near, far];
  assert.deepEqual(
    sortNearby(original, near).map((p) => p.id),
    ['far', 'near'],
  );
  assert.equal(original[0], near);
  near.myReaction = null;
  assert.equal(dislikedLast(original), original);
  assert.deepEqual(
    sortNearby(original, near).map((p) => p.id),
    ['near', 'far'],
  );

  const buttons = ['like', 'dislike'].map((value) => ({
    dataset: { votePoint: 'nmu1', pointVote: value },
    disabled: false,
    getAttribute: () => 'false',
    setAttribute() {},
  }));
  let listener,
    resolve,
    reject,
    requests = 0,
    changed = 0,
    events = 0,
    confirmChoice,
    expectedValue = 'like',
    messages = [];
  const box = {
    dataset: { reactionId: 'nmu1' },
    querySelectorAll: () => buttons,
    querySelector: () => ({ textContent: '' }),
  };
  global.document = {
    addEventListener: (name, fn) => {
      listener = fn;
    },
    removeEventListener() {},
    querySelectorAll: (selector) => (selector === '[data-reaction-id]' ? [box] : buttons),
  };
  global.window = {
    dispatchEvent: () => {
      events++;
    },
  };
  global.CustomEvent = class {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  global.__reactionTest = {
    api: (url, method, body) => {
      requests++;
      assert.equal(url, '/api/points/nmu1/reaction');
      assert.equal(method, 'PUT');
      assert.equal(body.value, expectedValue);
      return new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
    },
    esc: (value) => String(value),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    toast: (value) => messages.push(value),
  };
  const source = fs
    .readFileSync('dist/shared/point-reactions.js', 'utf8')
    .replace(/^import .*;\r?\n/, 'const {api,esc,icon,toast}=globalThis.__reactionTest;\n');
  const { reactionHTML, bindPointReactions } = await import(moduleURL(source));
  const html = reactionHTML({ id: 'nmu1', likeCount: 2, dislikeCount: 999, myReaction: 'dislike' });
  assert(html.includes('thumb-up') && html.includes('thumb-down'));
  assert(!html.includes('999') && !html.includes('dislikeCount'));
  const state = {
    account: { id: 'alice' },
    catalog: { version: 1, points: [{ id: 'nmu1', likeCount: 0 }] },
  };
  bindPointReactions({
    state,
    requireAccount: async () => true,
    onChanged: () => changed++,
    confirm: () =>
      new Promise((yes) => {
        confirmChoice = yes;
      }),
  });
  const click = () => listener({ target: { closest: () => buttons[0] } });
  const first = click(),
    duplicate = click();
  await Promise.resolve();
  assert.equal(requests, 1, 'Rapid taps share the pending reaction');
  assert(buttons.every((b) => b.disabled));
  resolve({ point: { id: 'nmu1', likeCount: 1, myReaction: 'like' }, version: 2 });
  await Promise.all([first, duplicate]);
  assert.equal(state.catalog.points[0].likeCount, 1);
  assert.equal(changed, 1);
  assert.equal(events, 1);
  assert(buttons.every((b) => !b.disabled));
  const stale = click();
  await Promise.resolve();
  state.account = { id: 'bob' };
  resolve({ point: { id: 'nmu1', likeCount: 200, myReaction: 'like' }, version: 3 });
  await stale;
  assert.equal(
    state.catalog.points[0].likeCount,
    1,
    'A previous account response cannot update the next account',
  );
  const failed = click();
  await Promise.resolve();
  reject(new Error('offline'));
  await failed;
  assert.equal(state.catalog.points[0].likeCount, 1);
  assert(messages.includes('offline'));
  assert(buttons.every((b) => !b.disabled));
  const requestCount = requests;
  const dislike = () => listener({ target: { closest: () => buttons[1] } });
  const cancelled = dislike();
  await Promise.resolve();
  assert.equal(requests, requestCount, 'Opening confirmation must not submit a vote');
  confirmChoice(false);
  await cancelled;
  assert.equal(requests, requestCount, 'Dismissing confirmation leaves votes unchanged');
  const confirmed = dislike();
  await Promise.resolve();
  await dislike();
  assert.equal(requests, requestCount, 'Repeated taps do not skip confirmation');
  expectedValue = 'dislike';
  confirmChoice(true);
  await Promise.resolve();
  assert.equal(requests, requestCount + 1);
  resolve({ point: { id: 'nmu1', likeCount: 1, myReaction: 'dislike' }, version: 4 });
  await confirmed;
  assert.equal(state.catalog.points[0].myReaction, 'dislike');
  delete global.__reactionTest;
  console.log(
    'PASS point reactions: exclusive buttons, private dislike totals, distance override, cancel restoration, duplicate taps, stale accounts and failed saves.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
