const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../..');
const cases = [
  'discover',
  'shots',
  'map',
  'my',
  'passport',
  'publish',
  'assistant',
  'admin',
  'discover-dark-small',
  'passport-dark-small',
  'discover-english-small',
  'publish-english-small',
  'assistant-keyboard-small',
];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function sourceFingerprint() {
  const h = crypto.createHash('sha256');
  function walk(dir) {
    for (const ent of fs
      .readdirSync(path.join(root, dir), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = dir + '/' + ent.name;
      if (ent.isDirectory()) walk(p);
      else if (
        /\.(?:js|json|wxml|wxss|wxs|html|css|svg|png|jpe?g|webp)$/.test(p) &&
        !/^miniprogram\/(?:project\.|config\.local)/.test(p)
      ) {
        h.update(p);
        const bytes = fs.readFileSync(path.join(root, p));
        h.update(
          /\.(?:png|jpe?g|webp)$/.test(p) ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n'),
        );
      }
    }
  }
  for (const d of ['dist', 'miniprogram', 'design']) {
    if (d === 'design') {
      h.update(fs.readFileSync(path.join(root, 'design/jingyu-components.json')));
      continue;
    }
    walk(d);
  }
  return h.digest('hex');
}
function compare(a, b) {
  a = PNG.sync.read(a);
  b = PNG.sync.read(b);
  if (a.width !== b.width || a.height !== b.height) return { different: 1, sizeChanged: true };
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(...[0, 1, 2].map((j) => Math.abs(a.data[i + j] - b.data[i + j]))) > 28) changed++;
  }
  return { different: changed / (a.width * a.height), sizeChanged: false };
}
function check(m, base) {
  if (m.version !== require('../../package.json').version)
    throw Error('Screenshot release mismatch');
  if (m.sourceFingerprint !== sourceFingerprint())
    throw Error(
      'UI source changed after screenshots; recapture affected views and review the matrix',
    );
  const capturedAt = Date.parse(m.capturedAt),
    now = Date.now();
  if (!Number.isFinite(capturedAt) || capturedAt > now + 300000 || now - capturedAt > 7 * 86400000)
    throw Error('Screenshot acceptance is older than 7 days');
  if (!Array.isArray(m.entries) || new Set(m.entries.map((e) => e.key)).size !== m.entries.length)
    throw Error('Screenshot entries are missing or duplicated');
  const results = [];
  for (const client of ['web', 'mini'])
    for (const name of cases) {
      const key = client + ':' + name,
        e = m.entries.find((x) => x.key === key);
      if (!e) throw Error('Missing screenshot ' + key);
      const file = path.resolve(root, e.file);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file))
        throw Error('Unsafe/missing screenshot ' + key);
      const bytes = fs.readFileSync(file),
        png = PNG.sync.read(bytes);
      if (hash(bytes) !== e.sha256 || png.width < 200 || png.height < 200)
        throw Error('Screenshot identity invalid ' + key);
      const entryTime = Date.parse(e.capturedAt);
      if (!Number.isFinite(entryTime) || entryTime > now + 300000 || now - entryTime > 7 * 86400000)
        throw Error('Missing or stale screenshot capture time ' + key);
      if (e.captureSource !== (client === 'mini' ? 'wechat-automator' : 'browser-ui'))
        throw Error('Missing actual client capture provenance ' + key);
      // A welcome/splash image still needs human review; reject completely blank captures here.
      const colors = new Set();
      for (let i = 0; i < png.data.length && colors.size < 16; i += 4)
        colors.add(
          (png.data[i] >> 3) + ':' + (png.data[i + 1] >> 3) + ':' + (png.data[i + 2] >> 3),
        );
      if (colors.size < 16) throw Error('Blank or incomplete screenshot ' + key);
      const l = e.layout;
      if (!l || l.overflow || l.viewportWidth < 280 || l.viewportWidth > 1600)
        throw Error('Layout overflow or missing dimensions ' + key);
      if (name.includes('small') && l.viewportWidth > 360)
        throw Error('Small screen was not captured ' + key);
      if (name.includes('english') && l.language !== 'en-US')
        throw Error('English state missing ' + key);
      if (name.includes('dark') && l.theme !== 'dark') throw Error('Dark state missing ' + key);
      if (name.includes('keyboard') && !(l.keyboardHeight > 100 || l.keyboardSimulation === true))
        throw Error('Keyboard state missing ' + key);
      for (const v of l.circleSizes || [])
        if (Math.abs(v.width - v.height) > 1 || v.width < 32)
          throw Error('Distorted circular control ' + key);
      const prev = base?.entries?.find((x) => x.key === key);
      if (!prev && !e.reviewedReason?.trim())
        throw Error('First screenshot baseline needs visual review ' + key);
      const diff = prev ? compare(bytes, fs.readFileSync(path.resolve(root, prev.file))) : null;
      if (diff && (diff.sizeChanged || diff.different > 0.08) && !e.reviewedReason)
        throw Error(
          'Screenshot changed without review ' +
            key +
            ' ' +
            (diff.different * 100).toFixed(1) +
            '%',
        );
      results.push({ key, ...diff, reviewedReason: e.reviewedReason || '' });
    }
  return results;
}
if (require.main === module) {
  const file = path.join(root, 'tests/.runs/ui-acceptance/current.json'),
    baseline = path.join(root, 'design/visual-baselines/manifest.json');
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = check(
    m,
    fs.existsSync(baseline) ? JSON.parse(fs.readFileSync(baseline, 'utf8')) : null,
  );
  fs.writeFileSync(
    path.join(root, 'tests/.runs/ui-acceptance/result.json'),
    JSON.stringify({ version: m.version, passed: true, results: result }, null, 2),
  );
  console.log(
    'PASS visual release gate: ' +
      result.length +
      ' web/native screenshots; small, dark, English, keyboard and geometry checked.',
  );
}
module.exports = { cases, sourceFingerprint, compare, check };
