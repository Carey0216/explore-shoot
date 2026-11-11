// Export the existing assistant avatars; navigation icons use generate-line-icons.cjs.
const fs = require('node:fs'),
  path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
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
