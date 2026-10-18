// Original vector artwork. Rebuild the matching web/native PNGs with npm ci && node tools/generate-badges.cjs.
const fs = require('node:fs'),
  path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, 'dist/shared/badges');
fs.mkdirSync(dir, { recursive: true });
const motifs = [
  ['光影之心', 'M120 151L78 110C48 72 91 52 120 84C149 52 192 72 162 110Z'],
  ['第一缕月光', 'M144 60A52 52 0 1 0 166 140A45 45 0 0 1 144 60Z'],
  [
    '建筑拾光',
    'M72 151V90L120 63L168 90V151ZM88 151V105H105V151M118 105H135V122H118ZM146 105H155V122H146Z',
  ],
  [
    '镜头诗人',
    'M72 91H97L107 76H133L143 91H168V147H72ZM142 117A22 22 0 1 1 98 117A22 22 0 1 1 142 117Z',
  ],
  ['一叶知秋', 'M164 67C96 62 65 94 88 140C128 171 172 122 164 67ZM88 144L144 90'],
  ['逐光罗盘', 'M120 60A50 50 0 1 0 120 160A50 50 0 1 0 120 60ZM145 86L127 120L95 137L112 103Z'],
  [
    '莲湖来信',
    'M120 150C75 147 64 121 70 101C86 101 100 109 120 132C99 103 102 82 120 64C138 82 141 103 120 132C140 109 154 101 170 101C176 121 165 147 120 150Z',
  ],
  [
    '钟楼守望',
    'M95 154V97L120 65L145 97V154ZM85 154H155M95 110H145M129 98A9 9 0 1 1 111 98A9 9 0 1 1 129 98ZM120 91V99H126',
  ],
  [
    '书海漫游',
    'M120 154C101 142 86 140 67 144V79C87 73 104 78 120 90C136 78 153 73 173 79V144C154 140 139 142 120 154ZM120 90V154M79 94L105 101M135 101L161 94',
  ],
  ['星河收藏家', 'M120 59L136 92L173 98L146 124L152 160L120 143L88 160L94 124L67 98L104 92Z'],
];
const palettes = [
  ['鎏金', '#fff2ad', '#dca94a', '#84601e', '#e39a9a'],
  ['月银', '#fcffff', '#b5c9d9', '#546d89', '#91bce0'],
  ['玫瑰金', '#ffdfca', '#d99a85', '#895752', '#e8a5bf'],
  ['青玉', '#daffe4', '#69b9a1', '#2c756a', '#8acdb1'],
  ['星曜', '#e6dfff', '#a69bdb', '#55437b', '#b8b2ef'],
];
const presets = [];
for (let tone = 0; tone < 5; tone++)
  for (let m = 0; m < 10; m++) {
    const n = tone * 10 + m + 1,
      id = 'badge-' + String(n).padStart(2, '0'),
      [label, light, base, dark, accent] = palettes[tone],
      [name, shape] = motifs[m];
    const outline =
      tone % 2 === 0
        ? 'M120 13Q129 13 139 19L205 57Q222 65 222 84V157Q222 176 205 185L139 223Q120 235 101 223L35 185Q18 176 18 157V84Q18 65 35 57L101 19Q111 13 120 13Z'
        : 'M120 11A109 109 0 1 1 119.9 11Z';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 240 240"><defs><linearGradient id="metal" x2=".8" y2="1"><stop stop-color="${light}"/><stop offset=".25" stop-color="${base}"/><stop offset=".48" stop-color="${light}"/><stop offset=".7" stop-color="${dark}"/><stop offset="1" stop-color="${base}"/></linearGradient><radialGradient id="enamel" cx=".3" cy=".2"><stop stop-color="${light}"/><stop offset=".35" stop-color="${accent}"/><stop offset="1" stop-color="${dark}"/></radialGradient><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".1"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><path d="${outline}" fill="url(#metal)" stroke="${dark}" stroke-width="3"/><path d="${outline}" transform="translate(120 120) scale(.91) translate(-120 -120)" fill="${base}" stroke="${light}" stroke-width="1.5"/><path d="${outline}" transform="translate(120 120) scale(.85) translate(-120 -120)" fill="url(#metal)" stroke="${dark}" stroke-width="1" filter="url(#grain)"/><circle cx="120" cy="112" r="69" fill="${dark}" opacity=".15"/><path d="${shape}" transform="translate(0 3)" stroke="${dark}" stroke-width="7" fill="${dark}" stroke-linejoin="round"/><path d="${shape}" stroke="${light}" stroke-width="2.5" fill="url(#enamel)" fill-rule="evenodd" stroke-linejoin="round" stroke-linecap="round"/><path d="M76 177Q120 202 164 177" stroke="${light}" stroke-width="2" fill="none"/><path d="M91 187L120 211L149 187L120 197Z" fill="url(#metal)" stroke="${dark}" stroke-width="1"/>${Array.from({ length: tone + 1 }, (_, j) => `<circle cx="${120 - tone * 8 + j * 16}" cy="29" r="3" fill="${light}"/>`).join('')}<path d="M41 72L46 80L54 82L46 85L43 94L40 85L32 82L40 80Z" fill="${light}" opacity=".8"/></svg>`;
    fs.writeFileSync(path.join(dir, id + '.svg'), svg);
    fs.writeFileSync(path.join(dir, id + '.png'), new Resvg(svg).render().asPng());
    presets.push({ id, title: label + ' · ' + name });
  }
fs.writeFileSync(
  path.join(root, 'dist/shared/badge-presets.js'),
  '// 50 original, editable vector medal designs.\nexport const badgePresets = ' +
    JSON.stringify(presets, null, 2) +
    ';\nexport const badgeURL = (id) => "/shared/badges/" + (/^badge-(0[1-9]|[1-4][0-9]|50)$/.test(id || "") ? id : "badge-01") + ".png";\n',
);
console.log('50 matching SVG / PNG medals generated.');
