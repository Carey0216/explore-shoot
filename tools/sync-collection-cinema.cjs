const fs = require('node:fs');
for (const [from, to] of [
  ['atlas', 'atlas-painter'],
  ['collection-cinema', 'collection-cinema'],
]) {
  let s = fs.readFileSync('miniprogram/services/' + from + '.js', 'utf8');
  s = s
    .replace(
      "const atlasPainter = require('./atlas');",
      "import * as atlasPainter from './atlas-painter.js';",
    )
    .replace(/module\.exports\s*=\s*\{([^}]+)\};?\s*$/, 'export {$1};\n');
  const target = 'dist/shared/' + to + '.js';
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== s) throw Error('Cinematic renderer differs: ' + target);
  } else fs.writeFileSync(target, s);
}
