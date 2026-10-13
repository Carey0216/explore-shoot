import { openCampusPanorama } from './campus-panorama.js';
import { api, esc, modal } from './ui.js';

// Java supplies the architectural parts; this module only draws and handles the camera.
export function openCampusScene(endpoint = '/api/maps/scene') {
  return modal(
    '三维校园',
    `<div class="campus-scene-toolbar"><label>查看建筑 <select id="scene-building"><option value="">全校鸟瞰</option></select></label><button class="button secondary" id="scene-top">平面</button><button class="button secondary" id="scene-home">复位</button></div><div id="campus-scene" class="campus-scene" role="region" aria-label="可旋转缩放的校园示意模型"><p role="status">正在准备校园模型…</p></div><div class="campus-scene-controls"><button class="button secondary" id="scene-left" aria-label="向左旋转">↶</button><button class="button secondary" id="scene-right" aria-label="向右旋转">↷</button><button class="button secondary" id="scene-plus" aria-label="放大模型">＋</button><button class="button secondary" id="scene-minus" aria-label="缩小模型">−</button><span>拖动旋转 · 双指缩放 / 移动</span></div><p id="scene-selection" aria-live="polite">点击楼宇查看名称，也可在上方选择。</p><p class="scene-disclaimer">示意模型：楼高、外观与图示位置未实测，不能据此判断入口和通行。公开轮廓：© OpenStreetMap contributors / ODbL。</p><button class="button secondary" id="scene-panorama">查看实景全景 ↗</button>`,
    (d) => {
      d.classList.add('campus-scene-dialog');
      d.querySelector('#scene-panorama').onclick = openCampusPanorama;
      let disposed = false,
        cleanup = () => {};
      Promise.all([
        import('./vendor/three/three.module.min.js'),
        import('./vendor/three/OrbitControls.js'),
        api(endpoint),
      ])
        .then(([T, { OrbitControls }, data]) => {
          if (disposed || !d.isConnected) return;
          cleanup = drawCampus(d, T, OrbitControls, data);
        })
        .catch((e) => {
          if (!disposed)
            d.querySelector('#campus-scene').innerHTML =
              `<p role="alert">${esc(e.message || '当前浏览器无法显示三维模型，请使用平面地图。')}</p>`;
        });
      return () => {
        disposed = true;
        cleanup();
      };
    },
  );
}

function drawCampus(d, T, OrbitControls, data) {
  if (data.coordinateSystem !== 'local-metres' || !Array.isArray(data.models))
    throw Error('校园模型数据无效');
  const host = d.querySelector('#campus-scene');
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setClearColor('#e5eeed');
  host.replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '校园三维建筑模型');
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(40, 1, 2, 8000);
  scene.add(new T.HemisphereLight('#fff8ee', '#8ea58f', 2.3));
  const sun = new T.DirectionalLight('#fff9ed', 2.7);
  sun.position.set(-450, 1100, 500);
  scene.add(sun);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 65;
  controls.maxDistance = 4200;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.enableDamping = false;
  const materialCache = new Map(),
    geometries = new Set(),
    batches = new Map(),
    selectable = [];
  const material = (color) => {
    if (!materialCache.has(color))
      materialCache.set(
        color,
        new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, side: T.DoubleSide }),
      );
    return materialCache.get(color);
  };
  const geometry = (type) => {
    let geo;
    if (type === 'spire') geo = new T.ConeGeometry(0.5, 1, 4);
    else if (type === 'tree') geo = new T.SphereGeometry(0.5, 7, 5);
    else if (type === 'gable') {
      const vertices = [
        -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
      ];
      geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geo.setIndex([0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 0, 3, 4, 0, 4, 1]);
      geo.computeVertexNormals();
    } else geo = new T.BoxGeometry(1, 1, 1);
    geometries.add(geo);
    return geo;
  };
  const queue = (p, model = null) => {
    const key = p.type + p.color;
    if (!batches.has(key)) batches.set(key, { type: p.type, color: p.color, values: [] });
    batches.get(key).values.push({ p, model });
  };
  function polygon(ring, height, elevation, color, parent = scene) {
    const shape = new T.Shape();
    ring.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const geo = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
    geo.rotateX(-Math.PI / 2);
    geometries.add(geo);
    const mesh = new T.Mesh(geo, material(color));
    mesh.position.y = elevation;
    parent.add(mesh);
    return mesh;
  }
  polygon(data.boundary, 5, -5, '#c1d2b5');
  const box = (x, z, w, h, depth, color, y = h / 2) =>
    queue({ type: 'box', position: [x, y, z], size: [w, h, depth], color });
  // Landscape is an illustrative composition from the supplied plan, not a routing graph.
  box(-263, 0, 26, 1, 750, '#d0d5d3');
  for (const z of [-265, -155, 270]) box(190, z, 940, 1, 12, '#e4e5de');
  box(475, 20, 13, 1, 640, '#e4e5de');
  box(-690, 0, 12, 1, 650, '#e4e5de');
  function ellipse(cx, cz, rx, rz, color) {
    const ring = Array.from({ length: 40 }, (_, i) => [
      cx + Math.cos((i / 40) * Math.PI * 2) * rx,
      cz + Math.sin((i / 40) * Math.PI * 2) * rz,
    ]);
    polygon(ring, 0.4, 0.8, color);
  }
  ellipse(-490, 15, 85, 215, '#8cc5d0');
  ellipse(-110, 30, 61, 165, '#8cc5d0');
  for (const [x, z] of [
    [-670, 175],
    [55, 25],
  ]) {
    ellipse(x, z, 55, 104, '#bc806c');
    ellipse(x, z, 43, 88, '#8fbea4');
    box(x, z, 66, 0.5, 135, '#73a990', 1.5);
    for (const zz of [-60, 0, 60]) box(x, z + zz, 64, 0.25, 1, '#edf0df', 1.9);
  }
  for (const model of data.models) {
    const group = new T.Group();
    group.position.fromArray(model.position);
    group.rotation.y = (-Number(model.rotation || 0) * Math.PI) / 180;
    scene.add(group);
    for (const part of model.parts) {
      if (part.type === 'polygon') {
        const mesh = polygon(part.ring, part.height, part.elevation || 0, part.color, group);
        mesh.userData.model = model;
        selectable.push(mesh);
      } else {
        const v = new T.Vector3(...part.position)
          .applyAxisAngle(new T.Vector3(0, 1, 0), group.rotation.y)
          .add(group.position);
        queue({ ...part, position: v.toArray(), rotation: group.rotation.y }, model);
      }
    }
  }
  // A fixed seed makes decorative tree placement reproducible and keeps trees away from buildings.
  for (let i = 0; i < 170; i++) {
    const x = ((i * 317) % 1430) - 710,
      z = ((i * 163) % 590) - 300;
    if (
      Math.abs(x + 263) < 28 ||
      data.models.some(
        (m) => Math.abs(m.position[0] - x) < 58 && Math.abs(m.position[2] - z) < 35,
      ) ||
      (Math.abs(x + 490) < 100 && Math.abs(z) < 220) ||
      (Math.abs(x + 110) < 76 && Math.abs(z) < 170) ||
      (Math.abs(x - 55) < 65 && Math.abs(z - 25) < 110) ||
      (Math.abs(x + 670) < 65 && Math.abs(z - 175) < 115)
    )
      continue;
    queue({
      type: 'tree',
      position: [x, 8, z],
      size: [16, 19, 16],
      color: i % 2 ? '#7f9f7b' : '#9cb58b',
    });
  }
  const dummy = new T.Object3D();
  for (const batch of batches.values()) {
    const mesh = new T.InstancedMesh(
      geometry(batch.type),
      material(batch.color),
      batch.values.length,
    );
    mesh.userData.models = batch.values.map((v) => v.model);
    batch.values.forEach(({ p }, i) => {
      dummy.position.fromArray(p.position);
      dummy.scale.fromArray(p.size);
      dummy.rotation.set(0, p.rotation || 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    selectable.push(mesh);
  }
  let frame = 0,
    disposed = false;
  const render = () => {
    if (!disposed && !frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderer.render(scene, camera);
      });
  };
  function home() {
    controls.target.set(0, 0, 0);
    const r = host.getBoundingClientRect();
    const xs = data.boundary.map((p) => p[0]),
      zs = data.boundary.map((p) => p[1]);
    const distance =
      Math.max(
        (Math.max(...xs) - Math.min(...xs)) / (0.728 * Math.max(0.3, r.width / r.height)),
        ((Math.max(...zs) - Math.min(...zs)) * 0.707) / 0.728,
      ) *
        1.25 +
      150;
    camera.position.set(0, distance * 0.707, distance * 0.707);
    controls.update();
    render();
  }
  function choose(model) {
    if (!model) {
      home();
      d.querySelector('#scene-selection').textContent = '点击楼宇查看名称，也可在上方选择。';
      return;
    }
    controls.target.set(model.position[0], model.height / 2, model.position[2]);
    camera.position.set(model.position[0] + 100, 220, model.position[2] + 260);
    controls.update();
    render();
    d.querySelector('#scene-building').value = model.id;
    d.querySelector('#scene-selection').textContent =
      model.name +
      ' · ' +
      model.zone +
      ' · ' +
      (model.positionEstimated ? '图示位置待校准' : '公开轮廓') +
      ' · 外观与楼高为示意';
  }
  const select = d.querySelector('#scene-building');
  select.innerHTML =
    '<option value="">全校鸟瞰</option>' +
    data.models
      .map((m) => `<option value="${esc(m.id)}">${esc(m.zone + ' · ' + m.name)}</option>`)
      .join('');
  select.onchange = () => choose(data.models.find((m) => m.id === select.value));
  controls.addEventListener('change', render);
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    const r = host.getBoundingClientRect();
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
    renderer.setSize(r.width, r.height);
    render();
  });
  resize.observe(host);
  d.querySelector('#scene-home').onclick = () => {
    select.value = '';
    choose(null);
  };
  d.querySelector('#scene-top').onclick = () => {
    camera.position.set(controls.target.x, 1200, controls.target.z + 1);
    controls.update();
    render();
  };
  for (const [id, angle] of [
    ['scene-left', -0.3],
    ['scene-right', 0.3],
  ])
    d.querySelector('#' + id).onclick = () => {
      camera.position
        .sub(controls.target)
        .applyAxisAngle(new T.Vector3(0, 1, 0), angle)
        .add(controls.target);
      controls.update();
      render();
    };
  for (const [id, factor] of [
    ['scene-plus', 0.8],
    ['scene-minus', 1.25],
  ])
    d.querySelector('#' + id).onclick = () => {
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      controls.update();
      render();
    };
  const ray = new T.Raycaster();
  let down;
  const pointerdown = (e) => {
    down = [e.clientX, e.clientY];
  };
  const pointerup = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    for (const hit of ray.intersectObjects(selectable)) {
      const model = hit.object.userData.model || hit.object.userData.models?.[hit.instanceId];
      if (model) {
        choose(model);
        break;
      }
    }
  };
  const lost = (e) => {
    e.preventDefault();
    d.querySelector('#scene-selection').textContent =
      '三维显示已中断，请关闭后重新打开，或使用平面地图。';
  };
  renderer.domElement.addEventListener('pointerdown', pointerdown);
  renderer.domElement.addEventListener('pointerup', pointerup);
  renderer.domElement.addEventListener('webglcontextlost', lost);
  home();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', pointerdown);
    renderer.domElement.removeEventListener('pointerup', pointerup);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materialCache.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
