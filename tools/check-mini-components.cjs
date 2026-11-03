// Keep native component dependencies local to the WXML files that use them.
const fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '../miniprogram');
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : e.name.endsWith('.wxml')
          ? [path.join(dir, e.name)]
          : [],
    );
}
let count = 0;
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
if (Object.keys(app.usingComponents || {}).length)
  throw Error('Register components at their consumers, not in app.json');
for (const file of walk(root)) {
  const config = file.replace(/\.wxml$/, '.json'),
    source = fs.readFileSync(file, 'utf8'),
    imports = JSON.parse(fs.readFileSync(config, 'utf8')).usingComponents || {};
  for (const [tag, target] of Object.entries(imports)) {
    if (!new RegExp('<' + tag + '(?:\\s|/|>)').test(source))
      throw Error('Unused component ' + tag + ' in ' + path.relative(root, config));
    if (
      !fs.existsSync(
        path.resolve(
          target.startsWith('/') ? root : path.dirname(file),
          target.replace(/^\//, '') + '.json',
        ),
      )
    )
      throw Error('Missing component ' + target);
    count++;
  }
  // Native tags have no dash; every custom tag must have an explicit declaration.
  const native = new Set([
    'scroll-view',
    'cover-view',
    'cover-image',
    'checkbox-group',
    'radio-group',
    'rich-text',
    'movable-area',
    'movable-view',
    'page-meta',
    'open-data',
    'live-player',
    'live-pusher',
    'web-view',
    'navigation-bar',
    'ad-custom',
    'official-account',
    'functional-page-navigator',
    'match-media',
    'voip-room',
  ]);
  for (const match of source.matchAll(/<([a-z][a-z0-9-]*-[a-z0-9-]+)\b/g))
    if (!native.has(match[1]) && !imports[match[1]])
      throw Error('Undeclared component ' + match[1] + ' in ' + path.relative(root, file));
}
console.log(
  'PASS native local component dependencies: ' +
    count +
    ' used declarations, no global injection or unused imports.',
);
