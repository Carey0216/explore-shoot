const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  cp = require('node:child_process');
cp.execFileSync(process.execPath, ['tools/sync-design-system.cjs', '--check'], {
  stdio: 'inherit',
});
const t = require('../design/jingyu-components.json');
assert(t.size.touch >= 44 && t.size.control === 40 && t.size.icon === 20);
assert(t.size.bubbleMax < 0.9);
assert(t.motion.close < t.motion.open);
assert(t.layers.dock > t.layers.content);
const { variables, ...mini } = require('../miniprogram/services/design-tokens');
assert.deepEqual(mini, t);
const w = fs.readFileSync('dist/shared/components820.css', 'utf8'),
  m = fs.readFileSync('miniprogram/styles/chat820.wxss', 'utf8');
assert(w.includes('--jy-bubble-max') && m.includes('--jy-bubble-max'));
assert(w.includes('--jy-dock-icon'));
// WXML expressions are parsed before XML entities: escaped operators fail the real compiler.
for (const file of fs.readdirSync('miniprogram', { recursive: true }).filter(f => f.endsWith('.wxml'))) {
  const source = fs.readFileSync('miniprogram/' + file, 'utf8');
  for (const expression of source.matchAll(/{{[\s\S]*?}}/g))
    assert(!/&(?:amp|lt|gt);/.test(expression[0]), 'Use native WXML operators in ' + file);
}
const { PNG } = require('pngjs'),
  { compare, check, sourceFingerprint } = require('../tools/visual/check-release.cjs');
const a = new PNG({ width: 10, height: 10 });
a.data.fill(255);
const b = new PNG({ width: 10, height: 10 });
b.data.fill(255);
b.data.fill(0, 0, 4);
assert.equal(compare(PNG.sync.write(a), PNG.sync.write(b)).different, 0.01);
const manifest = {
  version: require('../package.json').version,
  sourceFingerprint: sourceFingerprint(),
  capturedAt: 'invalid',
  entries: [],
};
assert.throws(() => check(manifest), /Screenshot acceptance/);
manifest.capturedAt = new Date(Date.now() + 3600000).toISOString();
assert.throws(() => check(manifest), /Screenshot acceptance/);
manifest.capturedAt = new Date().toISOString();
manifest.entries = [{ key: 'web:discover' }, { key: 'web:discover' }];
assert.throws(() => check(manifest), /duplicated/);
const api = fs.readFileSync('miniprogram/services/api.js', 'utf8');
assert(
  api.includes('client-(health|performance)'),
  'Diagnostics must not mutate page data/cache revisions',
);
console.log(
  'PASS shared component generation, optical geometry, image comparison and diagnostic isolation.',
);
