// Coordinate conversion is shared display infrastructure. All business rules remain in Java.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const [source, destination, transform] of [
  [
    'dist/shared/coordinates.js',
    'miniprogram/services/coordinates.js',
    (text) =>
      text.replaceAll('export function ', 'function ') +
      '\nmodule.exports = { toTencent, fromTencent, toBaidu, fromBaidu };\n',
  ],
  [
    'dist/shared/coordtransform-LICENSE.txt',
    'miniprogram/services/coordtransform-LICENSE.txt',
    (text) => text,
  ],
]) {
  const expected = transform(fs.readFileSync(path.join(root, source), 'utf8'));
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(path.join(root, destination), 'utf8') !== expected)
      throw Error(destination + ' is stale');
  } else fs.writeFileSync(path.join(root, destination), expected);
}
console.log('Mini-program coordinate conversion and license are current.');
