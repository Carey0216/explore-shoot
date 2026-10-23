import { api, esc, modal } from './ui.js';
import {
  createCampusMaterial,
  facadeMeshes,
  planarUV,
  photoPlanarUV,
  pitchedRoofGeometry,
  campusOverview,
  loadCampusDetail,
  disposeCampusDetail,
} from './campus-materials.js';

export function openCampusModel(endpoint = '/api/maps/photo-model') {
  return modal(
    '三维校园',
    `<div class="model-toolbar"><label>校区<select id="model-zone"><option value="">全校</option><option value="east">东校区</option><option value="west">西校区</option></select></label><label>查看建筑<select id="model-building"><option value="">校园总览</option></select></label><button class="button secondary" id="model-plan" aria-pressed="false">平面</button><button class="button secondary" id="model-photo" aria-pressed="true">建筑材质</button><button class="button secondary" id="model-home">总览</button></div><div class="campus-model-stage" role="region" aria-label="可旋转缩放的三维校园地图"><p role="status">正在加载三维校园…</p><div class="model-label" hidden></div></div><div class="model-controls"><button class="button secondary" data-model-turn="-1" aria-label="向左旋转校园">↶</button><button class="button secondary" data-model-turn="1" aria-label="向右旋转校园">↷</button><button class="button secondary" data-model-zoom="0.8" aria-label="放大三维校园">＋</button><button class="button secondary" data-model-zoom="1.25" aria-label="缩小三维校园">−</button><button class="button secondary" id="model-save">保存视图</button><span>拖动旋转 · 双指缩放 / 移动</span></div><p id="model-status" role="status" aria-live="polite">AI辅助建模，外观与位置估算，不用于导航。</p><details class="model-about"><summary>模型说明</summary><p>逐栋保留楼宇编号、轮廓、层数、屋顶和材质配置。钟楼按照片整理为平直建筑构件，使用正交立面贴图；体育馆两处可见墙面投影原始全景照片；未见墙面保留估算。其余采用编号图轮廓建模与AI材质补全。西校区主要依据编号图推测，隐蔽立面和高度未经实测。</p></details>`,
    (d) => {
      d.classList.add('campus-model-dialog');
      let disposed = false,
        cleanup = () => {};
      Promise.all([
        import('./vendor/three/three.module.min.js'),
        import('./vendor/three/OrbitControls.js'),
        api(endpoint),
      ])
        .then(([T, { OrbitControls }, data]) => {
          if (!disposed && d.isConnected) cleanup = renderCampusModel(d, T, OrbitControls, data);
        })
        .catch((e) => {
          if (!disposed && d.isConnected)
            d.querySelector('.campus-model-stage').innerHTML =
              `<p role="alert">${esc(e.message || '三维显示失败，请关闭后重试。')}</p>`;
        });
      return () => {
        disposed = true;
        cleanup();
      };
    },
  );
}

export function renderCampusModel(d, T, OrbitControls, data) {
  if (data?.coordinateSystem !== 'local-metres' || !Array.isArray(data.models))
    throw Error('三维校园数据无效。');
  const host = d.querySelector('.campus-model-stage'),
    label = host.querySelector('.model-label');
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(
    Math.min(devicePixelRatio || 1, matchMedia('(max-width:650px)').matches ? 1.25 : 1.6),
  );
  renderer.setClearColor('#dfede6');
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = !matchMedia('(max-width:650px)').matches;
  if (data.imageGround) renderer.shadowMap.enabled = false; // Original photo already contains shadows.
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '校园建筑、湖泊及运动场三维地图');
  host.querySelector('p')?.remove();
  host.prepend(renderer.domElement);
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(
      45,
      Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight),
      1,
      30000,
    );
  camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
  scene.add(new T.HemisphereLight('#fff8ee', '#759b86', 1.35));
  const sun = new T.DirectionalLight('#fff6e8', data.imageGround ? 0.85 : 1.6);
  sun.position.set(-800, 1100, 500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -1050,
    right: 1050,
    top: 850,
    bottom: -850,
    near: 1,
    far: 3000,
  });
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 45;
  controls.maxDistance = 12000;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enableDamping = false;
  const materials = new Map(),
    geometries = new Set(),
    textures = new Set(),
    selectable = [],
    images = [];
  const modelObjects = new Map(),
    details = new Map(),
    pendingDetails = new Map(),
    abort = new AbortController(),
    textureCache = new Map();
  let zone = '';
  let disposed = false,
    selected = null,
    flat = false,
    photo = true,
    down = null;
  const colors = {
    ivory: '#e9e7df',
    sand: '#e3d9c6',
    roof: '#d5d5cb',
    glass: '#69918f',
    frame: '#e9e7e0',
    red: '#b78170',
    terracotta: '#c6a893',
    silver: '#c3cecd',
  };
  const mat = (key) => {
    if (!materials.has(key) && data.materials?.[key]) {
      const architecture = !['grass', 'paving', 'water', 'track'].includes(key);
      const material = createCampusMaterial(
        T,
        renderer,
        data.materials[key],
        render,
        () => disposed,
        () => !architecture || photo,
        { textures, images, cache: textureCache },
      );
      material.userData.architecture = architecture;
      materials.set(key, material);
    }
    if (!materials.has(key))
      materials.set(
        key,
        new T.MeshStandardMaterial({
          color: colors[key] || key,
          roughness: 0.95,
          metalness: 0,
          side: T.DoubleSide,
        }),
      );
    return materials.get(key);
  };
  const own = (mesh, model) => {
    if (data.passport && !model.collected) {
      if (!materials.has('passport-uncollected'))
        materials.set(
          'passport-uncollected',
          new T.MeshStandardMaterial({ color: '#a2abaa', roughness: 1, side: T.DoubleSide }),
        );
      mesh.material = materials.get('passport-uncollected');
    }
    mesh.userData.model = model;
    selectable.push(mesh);
    if (!modelObjects.has(model.id)) modelObjects.set(model.id, []);
    modelObjects.get(model.id).push(mesh);
    return mesh;
  };
  const addGeo = (g) => {
    geometries.add(g);
    return g;
  };
  const shape = (ring) => {
    const s = new T.Shape();
    ring.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    return s;
  };
  function prism(ring, height, base, material, holes = [], model = null) {
    const s = shape(ring);
    for (const ring of holes) {
      const h = new T.Path();
      ring.forEach(([x, z], i) => (i ? h.lineTo(x, -z) : h.moveTo(x, -z)));
      h.closePath();
      s.holes.push(h);
    }
    const geo = addGeo(new T.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, steps: 1 }));
    geo.rotateX(-Math.PI / 2);
    planarUV(
      geo,
      material === 'grass' ? 2 : material === 'water' ? 10 : material === 'track' ? 2 : 6,
    );
    const mesh = new T.Mesh(geo, mat(material));
    mesh.position.y = base;
    mesh.castShadow = !!model;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (model) {
      own(mesh, model);
    }
    return mesh;
  }
  const block = (x, y, z, w, h, depth, color) => {
    const geometry = addGeo(new T.BoxGeometry(w, h, depth));
    if (data.materials?.[color])
      planarUV(geometry, color === 'paving' ? 3 : color === 'grass' ? 2 : 6);
    const m = new T.Mesh(geometry, mat(color));
    m.position.set(x, y, z);
    m.castShadow = w < 250;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  function imageSurface(ring, holes, base, model) {
    const polygon = shape(ring);
    for (const ring of holes || []) {
      const hole = new T.Path();
      ring.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
      hole.closePath();
      polygon.holes.push(hole);
    }
    const geometry = addGeo(new T.ShapeGeometry(polygon));
    geometry.rotateX(-Math.PI / 2);
    photoPlanarUV(geometry, data.imageMapping);
    const mesh = new T.Mesh(geometry, mat('photoImage'));
    mesh.position.y = base;
    scene.add(model ? own(mesh, model) : mesh);
  }
  if (data.imageGround) {
    imageSurface(data.imageGround.ring, [], data.imageGround.base);
    d.querySelector('#model-photo').textContent = '影像贴图';
    if (data.passport) d.querySelector('.dialog-head h2').textContent = '我的校园点亮图';
    d.querySelector('.model-about').innerHTML =
      '<summary>模型说明</summary><p>屋顶与地面对应同一张俯瞰原图。侧墙、楼高与比例为估算，建筑名称仍需核对；这不是完整摄影测量，也尚未配准导航地图。</p><p>照片来源由用户确认是实拍或卫星图，拍摄日期与测绘参数未知；没有用编号图中的图示位置代替影像位置。</p>';
  } else block(0, -0.6, 0, 1780, 1, 900, 'grass');
  // Ground paths are traced display features. They are deliberately disconnected from navigation.
  for (const r of data.roads)
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1],
        [bx, bz] = r.points[i],
        length = Math.hypot(bx - ax, bz - az);
      // Garden patches top out at y=.5; paths must sit above them rather than vanish beneath turf.
      const m = block((ax + bx) / 2, 0.59, (az + bz) / 2, r.width, 0.14, length, 'paving');
      m.rotation.y = Math.atan2(bx - ax, bz - az);
    }
  for (const p of data.landscape) {
    prism(
      p.ring,
      0.4,
      0.1,
      p.kind === 'water' ? 'water' : p.kind === 'paving' ? 'paving' : 'grass',
      p.holes || [],
    );
    for (const island of p.holes || []) prism(island, 0.6, 0.1, 'grass');
  }
  function oval(x, z, w, depth) {
    // Athletics tracks have straight sides and semicircular ends, not an ellipse.
    const radius = w / 2,
      straight = Math.max(0, depth / 2 - radius);
    return Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return [x + Math.cos(a) * radius, z + Math.sin(a) * radius + (i < 32 ? straight : -straight)];
    });
  }
  for (const f of data.fields) {
    const [x, z] = f.center,
      w = f.width,
      h = f.depth;
    prism(oval(x, z, w, h), 0.3, 0.7, 'track');
    prism(oval(x, z, w - 12, h - 15), 0.35, 1, 'grass');
    for (const offset of [0, 3, 6]) {
      const ring = oval(x, z, w - offset, h - offset),
        geo = addGeo(
          new T.BufferGeometry().setFromPoints(ring.map(([x, z]) => new T.Vector3(x, 1.45, z))),
        );
      const lineMaterial = new T.LineBasicMaterial({ color: '#eeeadd' });
      materials.set('track-line-' + materials.size, lineMaterial);
      const line = new T.LineLoop(geo, lineMaterial);
      scene.add(line);
    }
    const pitchW = w * 0.64,
      pitchH = h * 0.65;
    for (const xx of [-pitchW / 2, pitchW / 2])
      block(x + xx, 1.45, z, 0.22, 0.1, pitchH, '#eeeadd');
    for (const zz of [-pitchH / 2, 0, pitchH / 2])
      block(x, 1.45, z + zz, pitchW, 0.1, 0.22, '#eeeadd');
    const circle = oval(x, z, 12, 12),
      circleGeo = addGeo(
        new T.BufferGeometry().setFromPoints(circle.map(([cx, cz]) => new T.Vector3(cx, 1.5, cz))),
      );
    const circleMat = new T.LineBasicMaterial({ color: '#eeeadd' });
    materials.set('pitch-line-' + materials.size, circleMat);
    scene.add(new T.LineLoop(circleGeo, circleMat));
    const standDirection = f.standSide === 'west' ? -1 : 1;
    const standX = x + standDirection * (w / 2 + 6);
    for (let row = 0; row < 5; row++)
      block(
        standX + standDirection * row * 1.6,
        1.6 + row * 0.7,
        z,
        1.5,
        0.8,
        h * 0.65,
        row % 2 ? '#abc1cc' : '#e5e2d7',
      );
    block(standX + standDirection * 3, 8.5, z, 14, 0.8, h * 0.7, 'silver');
    for (const zz of [-h * 0.29, h * 0.29]) {
      for (const xx of [-3.6, 3.6]) block(x + xx, 2.6, z + zz, 0.2, 2.5, 0.2, '#f5f1e5');
      block(x, 3.85, z + zz, 7.4, 0.2, 0.2, '#f5f1e5');
    }
  }
  for (const f of data.facilities || []) {
    const [x, z] = f.center,
      w = f.width,
      depth = f.depth;
    if (f.kind === 'lowrise') {
      for (const ring of f.rings || []) {
        prism(ring, f.height, 0, 'ivoryWall');
        prism(ring, 0.6, f.height, 'tileRoof');
      }
    } else if (f.kind === 'bridge') {
      block(x, 6, z, w, 0.8, depth, 'paving');
      for (const offset of [-depth / 2, depth / 2]) {
        block(x, 7, z + offset, w, 0.16, 0.18, 'silver');
        for (let xx = -w / 2; xx <= w / 2; xx += 4)
          block(x + xx, 6.7, z + offset, 0.14, 1.4, 0.14, 'silver');
      }
      for (const side of [-1, 1]) {
        block(x + side * 13, 3, z, 1.6, 6, depth * 0.8, 'ivoryWall');
        const ramp = block(x + side * (w / 2 + 9), 3, z, 20, 0.7, depth, 'paving');
        ramp.rotation.z = side * 0.28;
      }
    } else if (f.kind === 'courts') {
      const cw = w / f.columns,
        cd = depth / f.rows;
      for (let row = 0; row < f.rows; row++)
        for (let col = 0; col < f.columns; col++) {
          const cx = x - w / 2 + (col + 0.5) * cw,
            cz = z - depth / 2 + (row + 0.5) * cd;
          block(cx, 0.8, cz, cw - 0.8, 0.2, cd - 0.8, col % 2 ? '#8ba5af' : '#69918b');
          for (const offset of [-0.43, 0.43]) {
            block(cx + cw * offset, 0.96, cz, 0.12, 0.1, cd * 0.88, '#eeeadd');
            block(cx, 0.96, cz + cd * offset, cw * 0.88, 0.1, 0.12, '#eeeadd');
          }
          block(cx, 0.96, cz, cw * 0.88, 0.1, 0.12, '#eeeadd');
        }
    }
  }
  for (const model of data.models) {
    const surfaces = new Map();
    for (const p of model.parts) {
      if (p.shape === 'imageRoof') {
        imageSurface(p.ring, p.holes, p.base, model);
        continue;
      }
      if (p.shape === 'surface') {
        if (!surfaces.has(p.material)) surfaces.set(p.material, []);
        surfaces.get(p.material).push(p);
        continue;
      }
      if (p.shape === 'pitchedRoof') {
        const shapeRoof = shape(p.ring);
        for (const ring of p.holes || []) {
          const hole = new T.Path();
          ring.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
          hole.closePath();
          shapeRoof.holes.push(hole);
        }
        const flatRoof = new T.ShapeGeometry(shapeRoof);
        flatRoof.rotateX(-Math.PI / 2);
        const geometry = addGeo(pitchedRoofGeometry(T, flatRoof, p));
        flatRoof.dispose();
        const roof = new T.Mesh(geometry, mat(p.material));
        roof.castShadow = true;
        roof.receiveShadow = true;
        scene.add(own(roof, model));
        continue;
      }
      if (p.shape === 'prism') prism(p.ring, p.height, p.base, p.material, p.holes || [], model);
      else if (p.shape === 'box') {
        const m = block(...p.position, ...p.size, p.material);
        own(m, model);
      } else if (p.shape === 'cone') {
        const m = new T.Mesh(
          addGeo(new T.ConeGeometry(p.size[0] / 2, p.size[1], 4)),
          mat(p.material),
        );
        m.position.fromArray(p.position);
        m.rotation.y = Math.PI / 4;
        scene.add(m);
        own(m, model);
      }
    }

    for (const [material, panels] of surfaces) {
      const mesh = facadeMeshes(T, panels, mat(material), model);
      addGeo(mesh.geometry);
      scene.add(own(mesh, model));
    }
  }
  const transform = new T.Object3D();
  // Trees are only placed within traced green polygons, using a stable grid.
  const inside = (x, z, ring) => {
    let found = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, az] = ring[i],
        [bx, bz] = ring[j];
      if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) found = !found;
    }
    return found;
  };
  const nearRoad = (x, z) =>
    data.roads.some((r) =>
      r.points.some((p, i) => {
        if (!i) return false;
        const a = r.points[i - 1],
          dx = p[0] - a[0],
          dz = p[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
        );
        return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < r.width / 2 + 3;
      }),
    );
  const trees = [];
  for (const p of data.landscape.filter((p) => p.kind === 'green')) {
    const xs = p.ring.map((p) => p[0]),
      zs = p.ring.map((p) => p[1]);
    for (let x = Math.min(...xs) + 8; x < Math.max(...xs); x += 16)
      for (let z = Math.min(...zs) + 8; z < Math.max(...zs); z += 16) {
        const jitter = (x * 17 + z * 13) % 11;
        const tx = x + jitter * 0.7,
          tz = z - jitter * 0.5;
        if (
          inside(tx, tz, p.ring) &&
          !nearRoad(tx, tz) &&
          !data.landscape.some(
            (g) =>
              g.kind === 'water' &&
              inside(tx, tz, g.ring) &&
              !(g.holes || []).some((h) => inside(tx, tz, h)),
          ) &&
          !data.fields.some(
            (f) =>
              Math.abs(tx - f.center[0]) < f.width / 2 + 10 &&
              Math.abs(tz - f.center[1]) < f.depth / 2 + 10,
          ) &&
          !(data.facilities || []).some(
            (f) =>
              Math.abs(tx - f.center[0]) < f.width / 2 + 3 &&
              Math.abs(tz - f.center[1]) < f.depth / 2 + 3,
          ) &&
          !data.models.some(
            (m) =>
              Math.abs(m.position[0] - tx) < m.extent[0] / 2 + 8 &&
              Math.abs(m.position[2] - tz) < m.extent[2] / 2 + 8,
          )
        )
          trees.push([tx, 5, tz]);
      }
  }
  const canopy = new T.InstancedMesh(
    addGeo(new T.IcosahedronGeometry(5, 1)),
    mat('#60855b'),
    trees.length,
  );
  trees.forEach((p, i) => {
    transform.position.fromArray(p);
    transform.rotation.set(0, i * 0.7, 0);
    const size = 0.8 + (i % 11) / 25;
    transform.scale.set(size, 1.2 * size, size);
    transform.updateMatrix();
    canopy.setMatrixAt(i, transform.matrix);
  });
  scene.add(canopy);
  const treeAsset = data.assets?.textures?.find((t) => t.id === 'tree');
  let treeSprites = null;
  if (treeAsset && trees.length) {
    const treeMaterial = createCampusMaterial(
      T,
      renderer,
      { url: treeAsset.url, region: [0, 0, 1, 1] },
      render,
      () => disposed,
      () => true,
      { textures, images, cache: textureCache },
    );
    treeMaterial.alphaTest = 0.6;
    treeMaterial.depthWrite = true;
    treeMaterial.polygonOffset = false;
    materials.set('tree-photo', treeMaterial);
    const plane = addGeo(new T.PlaneGeometry(14, 17));
    plane.translate(0, 8.5, 0);
    treeSprites = new T.InstancedMesh(plane, treeMaterial, trees.length);
    treeSprites.visible = false;
    scene.add(treeSprites);
  }
  function render() {
    if (disposed) return;
    if (treeSprites) {
      treeSprites.visible = !!treeSprites.material.userData.campusMap && !flat;
      canopy.visible = !treeSprites.visible;
      const angle = Math.atan2(
        camera.position.x - controls.target.x,
        camera.position.z - controls.target.z,
      );
      trees.forEach((p, i) => {
        transform.position.set(p[0], 0.6, p[2]);
        transform.rotation.set(0, angle, 0);
        const size = 0.75 + (i % 7) / 16;
        transform.scale.set(size, size, size);
        transform.updateMatrix();
        treeSprites.setMatrixAt(i, transform.matrix);
      });
      treeSprites.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (selected) {
      const v = new T.Vector3(
        selected.position[0],
        selected.height + 5,
        selected.position[2],
      ).project(camera);
      label.style.left = (v.x * 0.5 + 0.5) * host.clientWidth + 'px';
      label.style.top = (-v.y * 0.5 + 0.5) * host.clientHeight + 'px';
      label.hidden = v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1;
    }
  }
  function requestDetail(model) {
    if (model.meshAsset && !details.has(model.id) && !pendingDetails.has(model.id)) {
      pendingDetails.set(
        model.id,
        loadCampusDetail(T, model.meshAsset, model, abort.signal)
          .then((group) => {
            if (disposed) {
              disposeCampusDetail(group);
              return;
            }
            details.set(model.id, group);
            scene.add(group);
            group.traverse((m) => {
              if (m.isMesh) selectable.push(m);
            });
            visibility();
            render();
          })
          .catch(() => {
            if (!disposed && selected?.id === model.id)
              d.querySelector('#model-status').textContent =
                '建筑细节暂时未载入，已显示轮廓与材质。';
          })
          .finally(() => pendingDetails.delete(model.id)),
      );
    }
  }
  function select(model) {
    selected = model;
    label.hidden = !model;
    if (model) {
      label.textContent = model.name;
      controls.target.set(model.position[0], model.height * 0.3, model.position[2]);
      const distance =
        Math.max(model.extent[0] / Math.max(0.4, camera.aspect), model.extent[1], model.extent[2]) *
          1.8 +
        50;
      camera.position.set(
        model.position[0] + distance * (model.style === 'gym' ? 0.55 : -0.55),
        distance * 0.8,
        model.position[2] + distance * (['gym', 'clock'].includes(model.style) ? 0.95 : -0.95),
      );
      d.querySelector('#model-status').textContent =
        model.name +
        ' · ' +
        (data.imageGround
          ? model.appearance?.zone === 'west'
            ? '西侧影像范围'
            : '东侧影像范围'
          : model.appearance?.zone === 'west'
            ? '西校区 · 主要依据编号图补建'
            : '东校区 · 编号图与航拍参考') +
        (data.imageGround
          ? ' · 原图屋顶，侧墙与楼高估算'
          : model.photoSource
            ? ' · 真实全景立面，位置与高度估算'
            : ' · 外观与高度估算');
      if (data.passport)
        d.querySelector('#model-status').textContent =
          model.name + ' · ' + (model.collected ? '已点亮' : '未点亮');
      requestDetail(model);
    } else {
      const choices = data.models.filter((m) => !zone || m.appearance?.zone === zone);
      const view = campusOverview(
        T,
        choices,
        camera.aspect,
        camera.fov,
        data.imageGround ? 1.65 : 0.85,
      );
      controls.target.copy(view.target);
      camera.position.copy(view.position);
      d.querySelector('#model-status').textContent =
        choices.length +
        (data.imageGround
          ? '处影像楼体 · 屋顶与地面同图对应，楼高估算。'
          : '处建筑 · AI辅助建模，外观与位置估算，不用于导航。');
      if (data.passport) d.querySelector('#model-status').textContent = data.notice;
    }
    flat = false;
    d.querySelector('#model-plan').setAttribute('aria-pressed', 'false');
    visibility();
    controls.update();
    render();
  }
  const chooser = d.querySelector('#model-building');
  function fillChooser() {
    chooser.innerHTML =
      '<option value="">校园总览</option>' +
      data.models
        .filter((m) => !zone || m.appearance?.zone === zone)
        .map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`)
        .join('');
  }
  function visibility() {
    for (const model of data.models) {
      const visible = !zone || model.appearance?.zone === zone;
      const detail = details.get(model.id),
        showDetail = visible && !flat && !!detail;
      for (const object of modelObjects.get(model.id) || [])
        object.visible = visible && !showDetail;
      if (detail) {
        detail.visible = showDetail;
        detail.traverse((m) => {
          for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
            if (!material?.userData.detail) continue;
            material.map = photo ? material.userData.campusMap : null;
            material.needsUpdate = true;
          }
        });
      }
    }
  }
  if (data.passport) d.querySelector('#model-status').textContent = data.notice;
  fillChooser();
  d.querySelector('#model-zone').onchange = (e) => {
    zone = e.target.value;
    fillChooser();
    select(null);
  };
  chooser.onchange = () => select(data.models.find((m) => m.id === chooser.value));
  d.querySelector('#model-home').onclick = () => {
    chooser.value = '';
    select(null);
  };
  d.querySelector('#model-plan').onclick = () => {
    flat = !flat;
    const target = controls.target;
    const distance = Math.max(120, camera.position.distanceTo(target));
    camera.position.set(
      target.x + (flat ? 0 : distance * 0.4),
      target.y + distance * (flat ? 1 : 0.65),
      target.z + (flat ? 1 : distance * 0.7),
    );
    d.querySelector('#model-plan').setAttribute('aria-pressed', String(flat));
    visibility();
    controls.update();
    render();
  };
  d.querySelector('#model-photo').onclick = () => {
    photo = !photo;
    materials.forEach((m) => {
      if (m.userData.architecture) {
        m.map = photo ? m.userData.campusMap || null : null;
        m.color.set(photo ? '#ffffff' : '#d8d8cf');
        m.needsUpdate = true;
      }
    });
    visibility();
    d.querySelector('#model-photo').setAttribute('aria-pressed', String(photo));
    render();
  };
  d.querySelectorAll('[data-model-turn]').forEach(
    (b) =>
      (b.onclick = () => {
        camera.position
          .sub(controls.target)
          .applyAxisAngle(new T.Vector3(0, 1, 0), Number(b.dataset.modelTurn) * 0.3)
          .add(controls.target);
        controls.update();
        render();
      }),
  );
  d.querySelectorAll('[data-model-zoom]').forEach(
    (b) =>
      (b.onclick = () => {
        const v = camera.position.clone().sub(controls.target),
          distance = Math.max(
            controls.minDistance,
            Math.min(controls.maxDistance, v.length() * Number(b.dataset.modelZoom)),
          );
        camera.position.copy(controls.target).add(v.normalize().multiplyScalar(distance));
        controls.update();
        render();
      }),
  );
  d.querySelector('#model-save').onclick = () => {
    render();
    renderer.domElement.toBlob((blob) => {
      if (!blob || disposed) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = '校园三维视图.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };
  controls.addEventListener('change', render);
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
    render();
  });
  resize.observe(host);
  const ray = new T.Raycaster();
  const activePointers = new Set();
  const pointerdown = (e) => {
    activePointers.add(e.pointerId);
    down = activePointers.size === 1 ? [e.clientX, e.clientY] : null;
  };
  const pointercancel = (e) => {
    activePointers.delete(e.pointerId);
    down = null;
  };
  const pointerup = (e) => {
    const multi = activePointers.size > 1;
    activePointers.delete(e.pointerId);
    if (multi) {
      down = null;
      return;
    }
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray.intersectObjects(selectable).find((h) => {
      let object = h.object;
      while (object) {
        if (!object.visible) return false;
        object = object.parent;
      }
      return h.object.userData.model;
    });
    if (hit) {
      chooser.value = hit.object.userData.model.id;
      select(hit.object.userData.model);
    }
    down = null;
  };
  const lost = (e) => {
    e.preventDefault();
    d.querySelector('#model-status').textContent = '三维显示已中断，请关闭后重新打开。';
  };
  renderer.domElement.addEventListener('pointerdown', pointerdown);
  renderer.domElement.addEventListener('pointerup', pointerup);
  renderer.domElement.addEventListener('pointercancel', pointercancel);
  renderer.domElement.addEventListener('webglcontextlost', lost);
  select(null);
  data.models.filter((m) => m.meshAsset).forEach(requestDetail);
  return () => {
    disposed = true;
    abort.abort();
    details.forEach(disposeCampusDetail);
    details.clear();
    textureCache.clear();
    resize.disconnect();
    controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', pointerdown);
    renderer.domElement.removeEventListener('pointerup', pointerup);
    renderer.domElement.removeEventListener('pointercancel', pointercancel);
    activePointers.clear();
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    images.forEach((i) => {
      i.onload = i.onerror = null;
      i.removeAttribute('src');
    });
    canopy.dispose();
    treeSprites?.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
