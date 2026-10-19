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
for (const key of ['shield', 'camera', 'heart', 'message', 'settings', 'list', 'search']) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g transform="translate(4 4)" fill="none" stroke="#4e7892" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[key]}</g><circle cx="26" cy="26" r="2" fill="#d78196"/></svg>`;
  fs.writeFileSync(
    path.join(output, key + '.png'),
    new Resvg(svg, { fitTo: { mode: 'width', value: 96 } }).render().asPng(),
  );
}
console.log('Generated 7 native tool icons from shared vectors.');
