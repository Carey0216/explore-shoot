const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '../..');
const resources = 'backend/src/main/resources/';
const file = resources + 'campus-sdk-buildings.json';
const read = (name) => fs.readFileSync(path.join(root, name));
const json = (name) => JSON.parse(read(name));
const hash = (data) => createHash('sha256').update(data).digest('hex');

// Road centre intersections in the north-up source image. The final three
// observations are check points and do not contribute to the transform.
const anchors = [
  [6404051516, 631, 205],
  [6404051538, 800, 200],
  [6404051412, 1214, 201],
  [6426102697, 1496, 199],
  [6404051415, 1214, 411],
  [6404051173, 1405, 411],
  [6404051414, 1209, 596],
  [6404051523, 1207, 715],
  [6404051389, 630, 408],
  [6404051408, 800, 718],
  [6404051404, 1404, 599],
];

// Photo-specific corrections do not change passport outlines or live annotations.
const rect = (left, top, right, bottom) => [
  [left, top],
  [right, top],
  [right, bottom],
  [left, bottom],
];
const roofCorrections = {
  'east-03': rect(648, 216, 775, 248),
  'east-19': rect(973, 366, 1068, 392),
  'east-20': rect(1117, 363, 1197, 391),
  'east-21': rect(1062, 221, 1111, 285),
  'east-22': rect(1117, 220, 1210, 249),
};
// The source image shows two east wings where the basemap has only small service blocks.
const additions = [
  ['west-01-east-north', '西区院落东侧北翼', rect(152, 434, 235, 458), 18],
  ['west-01-east-south', '西区院落东侧南翼', rect(152, 490, 235, 515), 18],
];
const blocked = {
  'west-01': 'partial-native-coverage',
  'east-25': 'road-or-landscape',
  'east-40': 'road-or-landscape',
  'east-41': 'road-or-landscape',
  'east-42': 'road-or-landscape',
  'east-44': 'road-or-landscape',
  'east-45': 'outline-off-roof',
  'east-landmark': 'separate-calibrated-model',
};
const references = {
  'east-03': 'building-9',
  'east-16': 'library',
  'east-blue-hall': 'gym',
  'east-landmark': 'clock',
  'west-04': 'west-dining-5',
  'west-07': 'west-dining-4',
  'west-08': 'residence-23',
};
const round = (n, decimals = 7) => Number(n.toFixed(decimals));

function fitAffine(samples, key) {
  const rows = samples.map(({ x, y, node }) => [1, x / 1000, y / 1000, node[key]]);
  const matrix = Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => rows.reduce((sum, r) => sum + r[i] * r[j], 0)),
  );
  for (let i = 0; i < 3; i++) {
    const pivot = matrix[i][i];
    if (Math.abs(pivot) < 1e-10) throw Error('配准基点分布不足');
    matrix[i] = matrix[i].map((v) => v / pivot);
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const factor = matrix[j][i];
      matrix[j] = matrix[j].map((v, k) => v - factor * matrix[i][k]);
    }
  }
  const [a, b, c] = matrix.map((row) => row[3]);
  return (x, y) => a + (b * x + c * y) / 1000;
}

function contains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i],
      [bx, by] = ring[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function roofColor(photo, outline, holes) {
  const xs = outline.map((p) => p[0]),
    ys = outline.map((p) => p[1]);
  const samples = [[], [], []];
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 3)
    for (let y = Math.min(...ys); y < Math.max(...ys); y += 3) {
      if (!contains(outline, x, y) || holes.some((ring) => contains(ring, x, y))) continue;
      const i = (y * photo.width + x) * 4;
      const [r, g, b] = photo.data.subarray(i, i + 3);
      if (r + g + b < 255 || (g > r * 1.14 && g > b * 1.13)) continue;
      [r, g, b].forEach((v, c) => samples[c].push(v));
    }
  const color = samples.map((values) => {
    values.sort((a, b) => a - b);
    const channel = values[Math.floor(values.length / 2)] ?? 184;
    return Math.round(channel * 0.72 + 215 * 0.28)
      .toString(16)
      .padStart(2, '0');
  });
  return '#' + color.join('');
}

function generate() {
  const photoBytes = read('dist/shared/campus-assets/textures/overhead.jpg');
  const roofs = json(resources + 'campus-photo-roofs.json');
  const appearance = new Map(
    json(resources + 'campus-appearance.json').buildings.map((b) => [b.id, b]),
  );
  const photo = jpeg.decode(photoBytes, { useTArray: true });
  if (
    hash(photoBytes) !== roofs.sourceSHA256 ||
    photo.width !== roofs.imageWidth ||
    photo.height !== roofs.imageHeight
  )
    throw Error('航拍图与屋顶描画版本不匹配');
  const nodes = new Map(
    json('reference/campus-detail-osm.json')
      .elements.filter((e) => e.type === 'node')
      .map((n) => [n.id, n]),
  );
  const samples = anchors.map(([id, x, y]) => ({ id, x, y, node: nodes.get(id) }));
  const training = samples.slice(0, -3);
  const lng = fitAffine(training, 'lon'),
    lat = fitAffine(training, 'lat');
  const residual = ({ x, y, node }) =>
    round(Math.hypot((lng(x, y) - node.lon) * 87000, (lat(x, y) - node.lat) * 111200), 1);
  const checkMetres = samples.slice(-3).map(residual);
  if (Math.max(...samples.map(residual)) > 14) throw Error('校园影像配准偏差过大，请重新核对基点');
  const toWorld = ([x, y]) => [
    round(lng(y, photo.width - 1 - x)),
    round(lat(y, photo.width - 1 - x)),
  ];
  const ring = (pixels) => {
    if (
      pixels.length < 3 ||
      pixels.some(([x, y]) => x < 0 || x >= photo.width || y < 0 || y >= photo.height)
    )
      throw Error('屋顶轮廓超出航拍图');
    const points = pixels.map(toWorld);
    return [...points, points[0]];
  };
  const originalPixels = (pixels) => pixels.map(([x, y]) => [photo.width - 1 - y, x]);
  const parts = additions.map(([id, name, outline, height]) => ({
    id,
    name,
    outline: originalPixels(outline),
    height,
    holes: [],
    sections: [],
  }));
  const buildings = [...roofs.buildings, ...parts].map((b) => {
    const reference = appearance.get(references[b.id]);
    const outline = roofCorrections[b.id] ? originalPixels(roofCorrections[b.id]) : b.outline;
    const footprint = ring(outline);
    const holes = b.holes.map(ring);
    const sections = b.sections.map((s) => ({ footprint: ring(s.outline), height: s.height }));
    const center = [0, 1].map((c) =>
      round(footprint.slice(0, -1).reduce((sum, p) => sum + p[c], 0) / outline.length),
    );
    const height = reference?.floors && !sections.length ? reference.floors * 3.2 : b.height;
    const geometry = {
      footprint,
      holes,
      sections,
      height: round(height, 1),
      color: roofColor(photo, outline, b.holes),
    };
    return {
      id: b.id,
      name: reference?.name ?? b.name,
      center: { lng: center[0], lat: center[1] },
      ...geometry,
      estimated: true,
      geometryChecksum: hash(JSON.stringify(geometry)),
      ...(reference ? { appearanceReference: reference.id } : {}),
      ...(blocked[b.id] ? { blocked: blocked[b.id] } : {}),
      ...(b.id.startsWith('small-') ? { verifyOutline: true } : {}),
    };
  });
  return {
    coordinateSystem: 'WGS84',
    sourceSHA256: roofs.sourceSHA256,
    registration: {
      control: training.map(({ id, x, y }) => [id, x, y]),
      check: samples.slice(-3).map(({ id, x, y }) => [id, x, y]),
      checkMetres,
    },
    buildings,
  };
}

if (require.main === module) {
  const result = generate();
  const output = JSON.stringify(result, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (read(file).toString('utf8').replace(/\r\n/g, '\n') !== output)
      throw Error('地图楼栋资源与原始素材不一致，请重新生成');
  } else fs.writeFileSync(path.join(root, file), output);
  console.log(
    `${result.buildings.length} 栋影像候选楼栋 · 独立核对偏差 ${result.registration.checkMetres.join('、')} 米`,
  );
}

module.exports = { generate };
