const fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..'),
  source = fs.readFileSync(path.join(root, 'dist/shared/passport-card-art.js'), 'utf8');
fs.writeFileSync(
  path.join(root, 'miniprogram/services/passport-card-art.js'),
  '// Generated from dist/shared/passport-card-art.js; run node tools/sync-passport-art.cjs.\n' +
    source.replaceAll('export const ', 'const ').replaceAll('export function ', 'function ') +
    '\nmodule.exports={cardStyles,drawPassportCard};\n',
);
