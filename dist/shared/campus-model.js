import { api, esc, modal } from './ui.js';

export function openCampusModel(endpoint = '/api/maps/model') {
  return modal(
    '三维校园',
    `<div class="model-toolbar"><label>查看建筑<select id="model-building"><option value="">校园总览</option></select></label><button class="button secondary" id="model-plan" aria-pressed="false">平面</button><button class="button secondary" id="model-photo" aria-pressed="true">实景贴图</button><button class="button secondary" id="model-home">总览</button></div><div class="campus-model-stage" role="region" aria-label="可旋转缩放的三维校园地图"><p role="status">正在加载三维校园…</p><div class="model-label" hidden></div></div><div class="model-controls"><button class="button secondary" data-model-turn="-1" aria-label="向左旋转校园">↶</button><button class="button secondary" data-model-turn="1" aria-label="向右旋转校园">↷</button><button class="button secondary" data-model-zoom="0.8" aria-label="放大三维校园">＋</button><button class="button secondary" data-model-zoom="1.25" aria-label="缩小三维校园">−</button><button class="button secondary" id="model-save">保存视图</button><span>拖动旋转 · 双指缩放 / 移动</span></div><p id="model-status" role="status" aria-live="polite">楼群轮廓及部分高度为估算，不用于导航。</p><details class="model-about"><summary>模型说明</summary><p>8处建筑保留公开地图轮廓，其余依据编号图和航拍辨识补建。主楼、图书馆与体育馆使用可辨认的全景照片局部贴图；被遮挡的立面保持中性色。照片年代、楼高及图示位置尚需实地核对。</p><p>© OpenStreetMap contributors · ODbL-1.0；编号图与全景照片由用户提供。</p></details>`,
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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !matchMedia('(max-width:650px)').matches;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '校园建筑、湖泊及运动场三维地图');
  host.querySelector('p')?.remove();
  host.prepend(renderer.domElement);
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(38, 1, 1, 7000);
  scene.add(new T.HemisphereLight('#fff8ee', '#759b86', 1.35));
  const sun = new T.DirectionalLight('#fff6e8', 2.1);
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
  controls.maxDistance = 3500;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enableDamping = false;
  const materials = new Map(),
    geometries = new Set(),
    textures = new Set(),
    selectable = [],
    photos = [],
    images = [];
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
    const mesh = new T.Mesh(geo, mat(material));
    mesh.position.y = base;
    mesh.castShadow = !!model;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (model) {
      mesh.userData.model = model;
      selectable.push(mesh);
    }
    return mesh;
  }
  const block = (x, y, z, w, h, depth, color) => {
    const m = new T.Mesh(addGeo(new T.BoxGeometry(w, h, depth)), mat(color));
    m.position.set(x, y, z);
    m.castShadow = w < 250;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  block(0, -5, 0, 1780, 10, 900, '#d6e8d4');
  // Ground paths are traced display features. They are deliberately disconnected from navigation.
  for (const r of data.roads)
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1],
        [bx, bz] = r.points[i],
        length = Math.hypot(bx - ax, bz - az);
      const m = block((ax + bx) / 2, 0.18, (az + bz) / 2, r.width, 0.35, length, '#f2f1e8');
      m.rotation.y = Math.atan2(bx - ax, bz - az);
    }
  for (const p of data.landscape)
    prism(p.ring, 0.4, 0.1, p.kind === 'water' ? '#8bcbd1' : '#b8d6ad');
  function oval(x, z, w, depth) {
    return Array.from({ length: 60 }, (_, i) => [
      x + (Math.cos((i / 60) * Math.PI * 2) * w) / 2,
      z + (Math.sin((i / 60) * Math.PI * 2) * depth) / 2,
    ]);
  }
  for (const f of data.fields) {
    const [x, z] = f.center,
      w = f.width,
      h = f.depth;
    prism(oval(x, z, w, h), 0.3, 0.7, '#b38c80');
    prism(oval(x, z, w - 12, h - 15), 0.35, 1, '#9ab697');
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
    block(x, 1.45, z, w * 0.7, 0.14, 1, '#eeeadd');
    for (const zz of [-h * 0.3, h * 0.3]) {
      block(x, 1.45, z + zz, w * 0.7, 0.14, 0.6, '#eeeadd');
    }
  }
  // Compact batched windows provide scale without the old striped toy-building appearance.
  const windowPositions = [];
  for (const model of data.models) {
    for (const p of model.parts) {
      if (p.shape === 'prism') prism(p.ring, p.height, p.base, p.material, p.holes || [], model);
      else if (p.shape === 'box') {
        const m = block(...p.position, ...p.size, p.material);
        m.userData.model = model;
        selectable.push(m);
      } else if (p.shape === 'cone') {
        const m = new T.Mesh(
          addGeo(new T.ConeGeometry(p.size[0] / 2, p.size[1], 4)),
          mat(p.material),
        );
        m.position.fromArray(p.position);
        m.rotation.y = Math.PI / 4;
        scene.add(m);
        m.userData.model = model;
        selectable.push(m);
      } else if (p.shape === 'photo') {
        const [w, h] = p.size,
          geo = addGeo(new T.BufferGeometry());
        geo.setAttribute(
          'position',
          new T.Float32BufferAttribute(
            [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0],
            3,
          ),
        );
        geo.setAttribute('uv', new T.Float32BufferAttribute(p.uv.flat(), 2));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.computeVertexNormals();
        const material = new T.MeshBasicMaterial({ color: '#eee9de', side: T.DoubleSide });
        materials.set(model.id + '-' + p.face, material);
        const mesh = new T.Mesh(geo, material);
        mesh.position.fromArray(p.position);
        mesh.rotation.y = p.rotation || 0;
        mesh.visible = false;
        scene.add(mesh);
        photos.push(mesh);
        const image = new Image();
        images.push(image);
        image.onload = () => {
          if (disposed) return;
          const max = Math.min(
            renderer.capabilities.maxTextureSize,
            matchMedia('(max-width:650px)').matches ? 1536 : 2500,
          );
          let textureImage = image;
          if (image.width > max) {
            const scaled = document.createElement('canvas');
            scaled.width = scaled.height = max;
            scaled.getContext('2d').drawImage(image, 0, 0, max, max);
            textureImage = scaled;
          }
          const texture = new T.Texture(textureImage);
          texture.colorSpace = T.SRGBColorSpace;
          texture.needsUpdate = true;
          textures.add(texture);
          material.map = texture;
          material.color.set('#ffffff');
          material.needsUpdate = true;
          mesh.visible = photo;
          render();
        };
        image.onerror = () => {
          if (!disposed)
            d.querySelector('#model-status').textContent =
              '建筑轮廓已加载；部分照片贴图暂时不可用。';
        };
        image.src = '/shared/panorama/face_' + p.face + '.jpg';
      }
    }
    const body = model.parts.find((p) => p.shape === 'prism');
    if (!body || ['clock', 'library', 'gym'].includes(model.style)) continue;
    const ring = body.ring;
    for (let j = 0; j < ring.length; j++) {
      const [a, z] = ring[j],
        [b, q] = ring[(j + 1) % ring.length],
        len = Math.hypot(b - a, q - z);
      if (len < 5) continue;
      const count = Math.floor(len / 5),
        angle = Math.atan2(b - a, q - z);
      for (let floor = 1; floor < Math.floor(model.height / 3.3); floor++)
        for (let i = 1; i < count; i++)
          windowPositions.push({
            position: [a + ((b - a) * i) / count, floor * 3.3, z + ((q - z) * i) / count],
            angle,
          });
    }
  }
  const windows = new T.InstancedMesh(
    addGeo(new T.BoxGeometry(2.15, 1.35, 0.22)),
    mat('#97a6a3'),
    windowPositions.length,
  );
  const transform = new T.Object3D();
  windowPositions.forEach((p, i) => {
    transform.position.fromArray(p.position);
    transform.rotation.y = p.angle + Math.PI / 2;
    transform.updateMatrix();
    windows.setMatrixAt(i, transform.matrix);
  });
  scene.add(windows);
  // Trees are only placed within traced green polygons, using a stable grid.
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
    mat('#84ad83'),
    trees.length,
  );
  trees.forEach((p, i) => {
    transform.position.fromArray(p);
    transform.rotation.set(0, i * 0.7, 0);
    transform.scale.set(1, 1.3, 1);
    transform.updateMatrix();
    canopy.setMatrixAt(i, transform.matrix);
  });
  scene.add(canopy);
  function render() {
    if (disposed) return;
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
  function select(model) {
    selected = model;
    label.hidden = !model;
    if (model) {
      label.textContent = model.name;
      controls.target.set(model.position[0], model.height * 0.3, model.position[2]);
      const distance = Math.max(...model.extent) * 2.5 + 100;
      camera.position.set(
        model.position[0] + distance * (model.style === 'gym' ? 0.55 : -0.55),
        distance * 0.8,
        model.position[2] + distance * (model.style === 'gym' ? 0.95 : -0.95),
      );
      d.querySelector('#model-status').textContent =
        model.name +
        ' · ' +
        (model.positionEstimated ? '图示轮廓' : '公开地图轮廓') +
        ' · 高度与隐藏立面估算';
    } else {
      controls.target.set(0, 0, 0);
      camera.position.set(-780, 1050, -1200);
      d.querySelector('#model-status').textContent = '楼群轮廓及部分高度为估算，不用于导航。';
    }
    flat = false;
    d.querySelector('#model-plan').setAttribute('aria-pressed', 'false');
    controls.update();
    render();
  }
  const chooser = d.querySelector('#model-building');
  chooser.innerHTML =
    '<option value="">校园总览</option>' +
    data.models.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  chooser.onchange = () => select(data.models.find((m) => m.id === chooser.value));
  d.querySelector('#model-home').onclick = () => {
    chooser.value = '';
    select(null);
  };
  d.querySelector('#model-plan').onclick = () => {
    flat = !flat;
    const target = controls.target;
    camera.position.set(target.x + (flat ? 0 : 350), flat ? 900 : 550, target.z + (flat ? 1 : 650));
    d.querySelector('#model-plan').setAttribute('aria-pressed', String(flat));
    controls.update();
    render();
  };
  d.querySelector('#model-photo').onclick = () => {
    photo = !photo;
    photos.forEach((m) => (m.visible = photo && !!m.material.map));
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
    const hit = ray.intersectObjects(selectable).find((h) => h.object.userData.model);
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
  const first = data.models.find((m) => m.style === 'clock');
  chooser.value = first?.id || '';
  select(first);
  return () => {
    disposed = true;
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
    windows.dispose();
    canopy.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
