const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
(async () => {
  const T = await import('../dist/shared/vendor/three/three.module.min.js');
  const source = fs.readFileSync('dist/shared/campus-materials.js', 'utf8');
  const {
    campusOverview,
    createCampusMaterial,
    facadeMeshes,
    pitchedRoofGeometry,
    disposeCampusDetail,
  } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const sampleModels = [
    { position: [-780, 0, -280], extent: [130, 30, 40] },
    { position: [720, 0, 280], extent: [90, 80, 70] },
  ];
  for (const [width, height] of [
    [1280, 640],
    [390, 420],
  ]) {
    const view = campusOverview(T, sampleModels, width / height),
      camera = new T.PerspectiveCamera(45, width / height, 1, 30000);
    camera.position.copy(view.position);
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
    for (const m of sampleModels)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          for (const y of [0, m.extent[1]]) {
            const point = new T.Vector3(
              m.position[0] + (sx * m.extent[0]) / 2,
              y,
              m.position[2] + (sz * m.extent[2]) / 2,
            ).project(camera);
            assert(
              Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1,
              'Desktop and mobile overview must frame every building',
            );
          }
  }
  const shape = new T.Shape();
  shape.moveTo(-10, -5);
  shape.lineTo(10, -5);
  shape.lineTo(10, 5);
  shape.lineTo(-10, 5);
  shape.closePath();
  const hole = new T.Path();
  hole.moveTo(-2, -1);
  hole.lineTo(-2, 1);
  hole.lineTo(2, 1);
  hole.lineTo(2, -1);
  hole.closePath();
  shape.holes.push(hole);
  const flat = new T.ShapeGeometry(shape);
  flat.rotateX(-Math.PI / 2);
  const roof = pitchedRoofGeometry(T, flat, { axis: 'x', center: 0, half: 5, base: 20, rise: 3 });
  const p = roof.getAttribute('position');
  let area = 0,
    maxY = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new T.Vector3().fromBufferAttribute(p, i),
      b = new T.Vector3().fromBufferAttribute(p, i + 1),
      c = new T.Vector3().fromBufferAttribute(p, i + 2);
    area += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    const x = (a.x + b.x + c.x) / 3,
      z = (a.z + b.z + c.z) / 3;
    assert(!(Math.abs(x) < 1.999 && Math.abs(z) < 0.999), 'Courtyard must remain open');
    for (const v of [a, b, c]) {
      maxY = Math.max(maxY, v.y);
      assert(Number.isFinite(v.y));
      assert(v.y >= 20 && v.y <= 23);
    }
  }
  assert(Math.abs(area - 192) < 0.001, 'Roof split must preserve footprint area');
  assert.equal(maxY, 23, 'Ridge must be higher than eaves');
  const surfaces = [
    {
      vertices: [
        [0, 0, 0],
        [60, 0, 0],
        [60, 20, 0],
        [0, 20, 0],
      ],
      uv: [
        [0, 0],
        [3, 0],
        [3, 2],
        [0, 2],
      ],
    },
  ];
  const facade = facadeMeshes(T, surfaces, new T.MeshStandardMaterial(), {});
  assert.equal(
    facade.geometry.getAttribute('uv').getX(1),
    3,
    'UVs remain continuous across the entire facade',
  );
  assert.equal(facade.geometry.getIndex().count, 6);
  const images = [];
  global.Image = class {
    constructor() {
      images.push(this);
    }
  };
  global.innerWidth = 390;
  const crops = [];
  global.document = {
    createElement: () => ({
      getContext: () => ({ drawImage: (...args) => crops.push(args.slice(1, 5)) }),
    }),
  };
  const tracked = { textures: new Set(), images: [], cache: new Map() },
    renderer = { capabilities: { maxTextureSize: 4096, getMaxAnisotropy: () => 4 } };
  let renders = 0,
    closed = false,
    enabled = true;
  const definition = {
    url: '/shared/campus-assets/textures/brick.jpg',
    region: [0, 0.5, 0.5, 0.5],
  };
  const make = () =>
    createCampusMaterial(
      T,
      renderer,
      definition,
      () => renders++,
      () => closed,
      () => enabled,
      tracked,
    );
  const m1 = make(),
    m2 = make();
  assert.equal(images.length, 1, 'Shared atlas downloads only once');
  images[0].width = images[0].height = 1200;
  images[0].onload();
  await new Promise(setImmediate);
  assert(m1.map && m1.map === m2.map);
  assert.equal(tracked.textures.size, 1);
  assert.equal(renders, 2);
  assert.deepEqual(crops, [[0, 0, 600, 600]], 'Crop the top-left tile before mipmap construction');
  assert.equal(m1.map.wrapS, T.RepeatWrapping);
  assert.equal(m1.map.minFilter, T.LinearMipmapLinearFilter);
  const alternate = createCampusMaterial(
    T,
    renderer,
    { ...definition, region: [0, 0, 0.5, 0.5] },
    () => renders++,
    () => closed,
    () => enabled,
    tracked,
  );
  await new Promise(setImmediate);
  assert.equal(images.length, 1, 'Different atlas tiles share one image download');
  assert.notEqual(alternate.map, m1.map, 'Water and grass require separate GPU mipmaps');
  assert.deepEqual(crops[1], [0, 600, 600, 600]);
  const m3 = make();
  closed = true;
  await new Promise(setImmediate);
  assert.equal(m3.map, null, 'Late cached attachment must not render a closed viewer');
  assert.equal(renders, 3);
  assert.throws(() =>
    createCampusMaterial(
      T,
      renderer,
      { ...definition, url: 'https://example.com/tracker.jpg' },
      () => {},
      () => false,
      () => true,
      tracked,
    ),
  );
  const group = new T.Group(),
    detail = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial());
  group.add(detail);
  const texture = new T.Texture();
  detail.material.userData.campusMap = texture;
  detail.material.map = null;
  let released = 0;
  texture.addEventListener('dispose', () => released++);
  disposeCampusDetail(group);
  assert.equal(released, 1, 'Disabled detail textures must also be released');
  const manifest = JSON.parse(fs.readFileSync('dist/shared/campus-assets/manifest.json', 'utf8'));
  for (const asset of [...manifest.textures, ...manifest.models]) {
    assert(asset.url.startsWith('/shared/campus-assets/'));
    const bytes = fs.readFileSync('dist' + asset.url);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
  assert.equal(manifest.textures.length, 6);
  assert.equal(manifest.models.length, 1);
  const glb = fs.readFileSync('dist' + manifest.models[0].url);
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  assert.equal(glb.readUInt32LE(8), glb.length);
  const descriptor = JSON.parse(
    glb
      .subarray(20, 20 + glb.readUInt32LE(12))
      .toString()
      .trim(),
  );
  assert(
    descriptor.images.every((i) => i.bufferView !== undefined && !i.uri),
    'GLB must embed all images',
  );
  assert(
    descriptor.buffers.every((b) => !b.uri),
    'GLB must not fetch external geometry',
  );
  let triangles = 0;
  const binStart = 28 + glb.readUInt32LE(12);
  for (const mesh of descriptor.meshes)
    for (const primitive of mesh.primitives) {
      triangles += descriptor.accessors[primitive.indices].count / 3;
      for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
        const a = descriptor.accessors[primitive.attributes[key]],
          view = descriptor.bufferViews[a.bufferView];
        assert.equal(a.componentType, 5126);
        const size = key === 'TEXCOORD_0' ? 2 : 3,
          stride = view.byteStride || size * 4;
        for (let n = 0; n < a.count; n++)
          for (let k = 0; k < size; k++) {
            const value = glb.readFloatLE(
              binStart + (view.byteOffset || 0) + (a.byteOffset || 0) + n * stride + k * 4,
            );
            assert(Number.isFinite(value), key + ' must be finite');
            if (mesh.name === 'facade' && key === 'NORMAL') {
              assert(
                Math.abs(value) < 1e-5 || Math.abs(Math.abs(value) - 1) < 1e-5,
                'Architectural facade normals must remain planar instead of inheriting AI wall ripples',
              );
            }
            if (key === 'TEXCOORD_0')
              assert(value >= 0 && value <= 1, 'Detail atlas UV must remain within the image');
          }
      }
    }
  assert(
    triangles > 200 && triangles < 10000,
    'Planar detail geometry must remain lightweight enough for mobile use',
  );
  console.log(
    'PASS campus roof ridge / courtyard geometry, unwrapped facade UV, shared atlas loading, late cleanup, GLB integrity',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
