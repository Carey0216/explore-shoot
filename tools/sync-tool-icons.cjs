// Reuse the project's original vector icons for the native tool grid.
const fs = require('node:fs'),
  path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dist/shared/ui.js'), 'utf8');
const icons = Function(
  'return (' + source.match(/export const icons = (\{[\s\S]*?\n\});/)[1] + ')',
)();
const output = path.join(root, 'miniprogram/assets/tools');
fs.mkdirSync(output, { recursive: true });
const aliases = { compass: 'discover', calendar: 'discover', route: 'walk', person: 'user' };
for (const key of [
  'shield',
  'camera',
  'heart',
  'message',
  'settings',
  'list',
  'search',
  'user',
  'people',
  'pin',
  'clock',
  'check',
  'book',
  'copy',
  'share',
  'compass',
  'calendar',
  'route',
  'person',
  'thumb-up',
  'thumb-down',
  'bell',
  'discover',
  'walk',
]) {
  for (const [suffix, color] of [
    ['', '#4e7892'],
    ['-dark', '#a6cfff'],
    ['-dark-green', '#a1d9bb'],
    ['-dark-purple', '#d3b8ed'],
    ['-dark-muted', '#a8a8b0'],
    ['-dark-active', '#c6e1ff'],
    ['-active', '#326ba6'],
    ['-muted', '#81918b'],
  ]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[key] || icons[aliases[key]]}</svg>`;
    fs.writeFileSync(
      path.join(output, key + suffix + '.png'),
      new Resvg(svg, { fitTo: { mode: 'width', value: 72 } }).render().asPng(),
    );
  }
}
console.log('Generated native tool icons from shared vectors.');

const avatarSource = fs.readFileSync(path.join(root, 'dist/shared/assistant-avatars.js'), 'utf8');
const avatars = Function(
  'return (' + avatarSource.match(/export const assistantAvatars = (\{[\s\S]*?\n\});/)[1] + ')',
)();
const avatarOutput = path.join(root, 'miniprogram/assets/assistant');
fs.mkdirSync(avatarOutput, { recursive: true });
for (const [id, a] of Object.entries(avatars))
  fs.writeFileSync(
    path.join(avatarOutput, id + '.png'),
    new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${a.color}" opacity=".45"/>${a.shape}</svg>`,
      { fitTo: { mode: 'width', value: 128 } },
    )
      .render()
      .asPng(),
  );
