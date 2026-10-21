const assert = require('node:assert/strict');
const fs = require('node:fs');
let serial = 0;
async function load(file, bindings = {}) {
  global.__v725 = bindings;
  const code = fs.readFileSync(file, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(
        `const {${Object.keys(bindings)}}=globalThis.__v725;\n` + code + `\n//${serial++}`,
      ).toString('base64')
  );
}
(async () => {
  const { quizSession } = await load('dist/user/scout-paper.js');
  const paper = {
    questions: Array.from({ length: 5 }, (_, i) => ({
      id: 'q' + i,
      title: '题目' + i,
      options: ['甲', '乙', '丙', '丁'],
    })),
  };
  const quiz = quizSession(paper);
  assert.equal(quiz.index, 0);
  assert(!quiz.complete);
  assert.throws(() => quiz.choose(4));
  assert.throws(() => quiz.choose(1.1));
  for (let i = 0; i < 5; i++) {
    quiz.choose(i % 4);
    quiz.move(1);
  }
  assert.equal(quiz.index, 4);
  assert(quiz.complete);
  quiz.move(-1);
  assert.equal(quiz.question.id, 'q3');
  quiz.choose(0);
  const returned = quiz.answers;
  returned.q3 = 999;
  assert.equal(quiz.answers.q3, 0, 'External mutation cannot alter pending answers');
  quiz.move(-100);
  assert.equal(quiz.index, 0);
  assert(quiz.complete);
  assert(!JSON.stringify(paper).includes('answer'), 'Client paper has no answer key');

  const makeColumn = () => ({
    className: '',
    children: [],
    append(card) {
      this.children.push(card);
      card.parent = this;
    },
  });
  const feed = {
    children: [],
    dataset: {},
    append(col) {
      this.children.push(col);
    },
  };
  const cards = Array.from({ length: 5 }, (_, id) => ({
    id,
    matches: () => true,
    classList: { contains: () => false },
    querySelectorAll: () => [],
  }));
  feed.children = cards;
  const { stabilizeFeeds } = await load('dist/shared/feed-layout.js', {
    document: { createElement: makeColumn },
  });
  stabilizeFeeds({ querySelectorAll: () => [feed] });
  const columns = feed.children.slice(5);
  assert.deepEqual(
    columns.map((c) => c.children.map((x) => x.id)),
    [
      [0, 2, 4],
      [1, 3],
    ],
  );
  assert.equal(feed.dataset.imageLayout, 'stable');

  let reply,
    created = 0;
  const { requestCelebration } = await load('dist/shared/celebrations.js', {
    document: {
      hidden: false,
      documentElement: { dataset: {} },
      createElement: () => {
        created++;
        throw Error('stale effect');
      },
    },
    matchMedia: () => ({ matches: false }),
    api: () => new Promise((resolve) => (reply = resolve)),
  });
  const pending = requestCelebration(
    'scout-passed',
    { page: 'publish', account: { id: 'first' } },
    () => false,
  );
  reply({ items: [{ token: 'private-token', duration: 2000, density: 30 }] });
  await pending;
  assert.equal(created, 0, 'Late response after a page/account change cannot display confetti');

  const { activityStamp } = await load('dist/user/activities.js', {
    esc: (s) => String(s).replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    badgeURL: () => '/badge.svg',
  });
  assert(
    activityStamp({ title: '<img>', earned: false, progress: 0, target: 2 }).includes('未获得'),
  );
  assert(
    !activityStamp({ title: '<img>', earned: false, progress: 0, target: 2 }).includes('<img>'),
  );
  assert(
    activityStamp({ title: '完成', earned: true, progress: 2, target: 2 }).includes('is-earned'),
  );
  console.log(
    'PASS v7.2.5: per-question answers/backtracking, immutable submission, stable image columns, stale celebration rejection and safe earned/locked stamp cards.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
