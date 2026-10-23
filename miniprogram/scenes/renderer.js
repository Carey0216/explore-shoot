const {
  campusOverview,
  facadeMeshes,
  planarUV,
  photoPlanarUV,
  pitchedRoofGeometry,
  disposeCampusDetail,
} = require('./mesh-math');
const api = require('../services/api');
function makeRenderer(canvas, width, height, dark) {
  const T = require('./vendor/three').createScopedThreejs(canvas);
  // r108 uses addAttribute and BufferGeometry variants; the mathematical port uses modern names.
  T.BufferGeometry.prototype.setAttribute = T.BufferGeometry.prototype.addAttribute;
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(
    Math.min(1.5, (wx.getWindowInfo?.() || wx.getSystemInfoSync()).pixelRatio || 1),
  );
  renderer.setSize(width, height);
  renderer.setClearColor(dark ? '#101619' : '#dfede6');
  renderer.gammaOutput = true;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(45, width / height, 0.1, 30000);
  scene.add(new T.HemisphereLight('#fff8ee', '#759b86', 1.3));
  const sun = new T.DirectionalLight('#fff6e8', 1.1);
  sun.position.set(-800, 1100, 500);
  scene.add(sun);
  let disposed = false,
    target = new T.Vector3(),
    radius = 1900,
    yaw = 0,
    pitch = 0.8,
    scheduled = false,
    panoramic = false;
  function render() {
    if (disposed || scheduled) return;
    scheduled = true;
    canvas.requestAnimationFrame(() => {
      scheduled = false;
      if (disposed) return;
      if (panoramic) {
        camera.position.set(0, 0, 0);
        camera.lookAt(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          -Math.cos(yaw) * Math.cos(pitch),
        );
      } else {
        camera.position.set(
          target.x + radius * Math.cos(pitch) * Math.sin(yaw),
          target.y + radius * Math.sin(pitch),
          target.z + radius * Math.cos(pitch) * Math.cos(yaw),
        );
        camera.lookAt(target);
      }
      renderer.render(scene, camera);
    });
  }
  function rotate(dx, dy) {
    yaw += dx * 0.008;
    pitch = panoramic
      ? Math.max(-1.48, Math.min(1.48, pitch + dy * 0.006))
      : Math.max(0.05, Math.min(1.565, pitch + dy * 0.006));
    render();
  }
  function zoom(factor) {
    if (panoramic) {
      camera.fov = Math.max(35, Math.min(100, camera.fov * factor));
      camera.updateProjectionMatrix();
      render();
      return;
    }
    radius = Math.max(20, Math.min(12000, radius * factor));
    render();
  }
  function dispose() {
    disposed = true;
    scene.background?.dispose?.();
    scene.background = null;
    disposeCampusDetail(scene);
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return {
    T,
    scene,
    camera,
    renderer,
    render,
    rotate,
    zoom,
    dispose,
    get disposed() {
      return disposed;
    },
    focus(model, models) {
      panoramic = false;
      camera.fov = 45;
      camera.updateProjectionMatrix();
      if (model) {
        target.fromArray(model.position);
        target.y = model.height * 0.3;
        radius = Math.max(...model.extent) * 2.1 + 40;
        pitch = 0.75;
        yaw = model.style === 'gym' ? 0.6 : -0.5;
      } else {
        const v = campusOverview(T, models, camera.aspect);
        target.copy(v.target);
        radius = v.position.distanceTo(target);
        pitch = 0.8;
        yaw = 0;
      }
      render();
    },
    flat() {
      pitch = pitch > 1.5 ? 0.8 : 1.565;
      render();
    },
    look(y, p, f) {
      panoramic = true;
      target.set(0, 0, 0);
      yaw = (y * Math.PI) / 180;
      pitch = (p * Math.PI) / 180;
      camera.fov = f;
      camera.updateProjectionMatrix();
      radius = 0.01;
      render();
    },
  };
}
async function detail(T, asset, model) {
  if (!/^\/shared\/campus-assets\/models\/[a-z0-9.-]+\.glb$/.test(asset.url))
    throw Error('建筑模型地址无效');
  const buffer = await binary(asset.url);
  if (buffer.byteLength > 32000000 || new DataView(buffer).getUint32(0, true) !== 0x46546c67)
    throw Error('建筑模型格式无效');
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith('data:')) throw Error('仅允许内嵌模型材质');
    return url;
  });
  const Loader = require('./vendor/GLTFLoader')(T),
    gltf = await new Promise((resolve, reject) =>
      new Loader(manager).parse(buffer, '', resolve, reject),
    );
  const object = gltf.scene,
    bounds = new T.Box3().setFromObject(object),
    size = bounds.getSize(new T.Vector3()),
    center = bounds.getCenter(new T.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw Error('模型尺寸无效');
  const scale = model.height / size.y;
  object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  object.scale.setScalar(scale);
  const group = new T.Group();
  group.add(object);
  group.rotation.y = asset.rotation || 0;
  group.position.fromArray(model.position);
  return group;
}
function binary(path) {
  if (
    !/^\/shared\/(?:campus-assets\/models\/[a-z0-9.-]+\.glb|panorama\/manifest\.json)$/.test(path)
  )
    return Promise.reject(Error('三维资源地址无效'));
  return new Promise((resolve, reject) =>
    wx.request({
      url: require('../services/network').backendOrigin() + path,
      responseType: path.endsWith('.glb') ? 'arraybuffer' : 'text',
      success: (r) => (r.statusCode === 200 ? resolve(r.data) : reject(Error('三维资源暂不可用'))),
      fail: reject,
    }),
  );
}
function campus(view, data) {
  const { T, scene, renderer, render } = view;
  let disposed = false,
    photo = true;
  const geometries = new Set(),
    materials = new Map(),
    textures = new Set(),
    selectable = [],
    modelObjects = new Map(),
    images = [],
    textureCache = new Map();
  function createCampusMaterial(T, renderer, definition) {
    const material = new (definition.photographic ? T.MeshBasicMaterial : T.MeshStandardMaterial)({
      color: '#d8d8cf',
      side: T.DoubleSide,
      ...(definition.photographic ? {} : { roughness: 0.94 }),
    });
    const path = definition.url;
    if (!/^\/shared\/campus-assets\/textures\/[a-z0-9.-]+$/.test(path)) return material;
    const key = path;
    if (!textureCache.has(key))
      textureCache.set(
        key,
        api.download(path, false).then(
          (src) =>
            new Promise((resolve, reject) => {
              const im = wx
                .createOffscreenCanvas({ type: '2d', width: 1, height: 1 })
                .createImage();
              im.onload = () => resolve(im);
              im.onerror = reject;
              im.src = src;
              images.push(im);
            }),
        ),
      );
    textureCache
      .get(key)
      .then((image) => {
        if (disposed || view.disposed) return;
        const [u, v, w, h] = definition.region || [0, 0, 1, 1],
          size = definition.photographic ? 1024 : 512;
        const crop = wx.createOffscreenCanvas({ type: '2d', width: size, height: size });
        crop
          .getContext('2d')
          .drawImage(
            image,
            image.width * u,
            image.height * (1 - v - h),
            image.width * w,
            image.height * h,
            0,
            0,
            size,
            size,
          );
        const texture = new T.CanvasTexture(crop);
        texture.wrapS = texture.wrapT = definition.photographic
          ? T.ClampToEdgeWrapping
          : T.RepeatWrapping;
        texture.encoding = T.sRGBEncoding;
        texture.needsUpdate = true;
        textures.add(texture);
        material.userData.campusMap = texture;
        material.map = texture;
        material.color.set('#ffffff');
        material.needsUpdate = true;
        render();
      })
      .catch(() => {});
    return material;
  }
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
    const geo = addGeo(
      new T.ExtrudeBufferGeometry(s, { depth: height, bevelEnabled: false, steps: 1 }),
    );
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
    const geometry = addGeo(new T.BoxBufferGeometry(w, h, depth));
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
    const geometry = addGeo(new T.ShapeBufferGeometry(polygon));
    geometry.rotateX(-Math.PI / 2);
    photoPlanarUV(geometry, data.imageMapping);
    const mesh = new T.Mesh(geometry, mat('photoImage'));
    mesh.position.y = base;
    scene.add(model ? own(mesh, model) : mesh);
  }
  if (data.imageGround) {
    imageSurface(data.imageGround.ring, [], data.imageGround.base);
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
        const flatRoof = new T.ShapeBufferGeometry(shapeRoof);
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
          addGeo(new T.ConeBufferGeometry(p.size[0] / 2, p.size[1], 4)),
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

  const details = new Map(),
    pending = new Set();
  async function selected(model) {
    if (
      !model ||
      (data.passport && !model.collected) ||
      !model.meshAsset ||
      details.has(model.id) ||
      pending.has(model.id)
    )
      return;
    pending.add(model.id);
    try {
      const group = await detail(T, model.meshAsset, model);
      if (disposed || view.disposed) {
        disposeCampusDetail(group);
        return;
      }
      details.set(model.id, group);
      scene.add(group);
      for (const object of modelObjects.get(model.id) || []) object.visible = false;
      render();
    } finally {
      pending.delete(model.id);
    }
  }
  function zone(value) {
    for (const model of data.models) {
      const visible = !value || model.appearance?.zone === value;
      for (const object of modelObjects.get(model.id) || [])
        object.visible = visible && !details.has(model.id);
      if (details.has(model.id)) details.get(model.id).visible = visible;
    }
    render();
  }
  function toggle() {
    photo = !photo;
    materials.forEach((m) => {
      if (m.userData.architecture) {
        m.map = photo ? m.userData.campusMap || null : null;
        m.color.set(photo ? '#ffffff' : '#d8d8cf');
        m.needsUpdate = true;
      }
    });
    render();
  }
  const clear = () => {
    disposed = true;
    images.forEach((i) => {
      i.onload = i.onerror = null;
    });
    textures.forEach((t) => t.dispose());
  };
  view.focus(null, data.models);
  return { selected, zone, toggle, clear };
}
async function panorama(view) {
  const { T, scene, renderer, render } = view,
    raw = await binary('/shared/panorama/manifest.json'),
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (data.projection !== 'cube' || data.faces?.length !== 6) throw Error('全景资料不完整');
  const size = Math.min(1536, renderer.capabilities.maxCubemapSize || 1536);
  const faces = await Promise.all(
    ['l', 'r', 'u', 'd', 'b', 'f'].map(async (id) => {
      const f = data.faces.find((f) => f.id === id);
      if (f?.file !== 'face_' + id + '.jpg') throw Error('全景方向资料无效');
      const path = await api.download('/shared/panorama/' + f.file, false);
      if (view.disposed) throw Error('页面已关闭');
      return new Promise((resolve, reject) => {
        const canvas = wx.createOffscreenCanvas({ type: '2d', width: size, height: size }),
          image = canvas.createImage();
        image.onload = () => {
          if (view.disposed) {
            image.src = '';
            return reject(Error('页面已关闭'));
          }
          try {
            canvas.getContext('2d').drawImage(image, 0, 0, size, size);
            image.onload = image.onerror = null;
            image.src = '';
            resolve(canvas);
          } catch (e) {
            reject(e);
          }
        };
        image.onerror = () => reject(Error('全景照片暂不可用，请重试'));
        image.src = path;
      });
    }),
  );
  if (view.disposed) return;
  const texture = new T.CubeTexture(faces);
  texture.encoding = T.sRGBEncoding;
  texture.needsUpdate = true;
  scene.background = texture;
  view.look(180, -25, 75);
  render();
}
module.exports = { makeRenderer, campus, panorama };
