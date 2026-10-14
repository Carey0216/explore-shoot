// Keep facade UVs continuous; crop atlas tiles before ordinary GPU repeat/mipmap sampling.
export function campusOverview(T, models, aspect, fov = 45) {
  if (!models.length || !Number.isFinite(aspect) || aspect <= 0) throw Error('校园总览范围无效。');
  const bounds = new T.Box3();
  for (const m of models) {
    const [x, , z] = m.position,
      [w, h, d] = m.extent;
    bounds.expandByPoint(new T.Vector3(x - w / 2 - 50, 0, z - d / 2 - 50));
    bounds.expandByPoint(new T.Vector3(x + w / 2 + 50, h, z + d / 2 + 50));
  }
  const target = bounds.getCenter(new T.Vector3()),
    radius = bounds.getSize(new T.Vector3()).length() / 2;
  const halfFov = Math.min(
    (fov * Math.PI) / 360,
    Math.atan(Math.tan((fov * Math.PI) / 360) * aspect),
  );
  const distance = Math.max(650, (radius / Math.sin(halfFov)) * 1.05);
  return {
    target,
    position: target
      .clone()
      .add(new T.Vector3(-0.65, 0.75, -0.7).normalize().multiplyScalar(distance)),
  };
}

export function createCampusMaterial(T, renderer, definition, render, disposed, enabled, tracked) {
  const material = new T.MeshStandardMaterial({
    color: '#d8d8cf',
    roughness: 0.94,
    metalness: 0,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const region = definition.region;
  if (!Array.isArray(region) || region.length !== 4 || region.some((n) => !Number.isFinite(n)))
    throw Error('建筑材质区域无效。');
  if (
    region.some((n) => n < 0) ||
    region[2] <= 0 ||
    region[3] <= 0 ||
    region[0] + region[2] > 1 ||
    region[1] + region[3] > 1
  )
    throw Error('建筑材质区域无效。');
  if (!/^\/shared\/campus-assets\/textures\/[a-z0-9.-]+$/.test(definition.url))
    throw Error('建筑材质地址无效。');
  const attach = (texture) => {
    if (!texture || disposed()) return;
    material.userData.campusMap = texture;
    material.map = enabled() ? texture : null;
    material.color.set(enabled() ? '#ffffff' : '#d8d8cf');
    material.needsUpdate = true;
    render();
  };
  // Crop each atlas tile before mipmaps are built. Repeating a full atlas with
  // fract(UV) lets distant samples mix grass, water, stone and track colours.
  const key = 'texture:' + definition.url + ':' + region.join(',');
  if (!tracked.cache.has(key)) {
    const imageKey = 'image:' + definition.url;
    if (!tracked.cache.has(imageKey)) {
      tracked.cache.set(
        imageKey,
        new Promise((resolve) => {
          const image = new Image();
          tracked.images.push(image);
          image.onload = () => resolve(disposed() ? null : image);
          image.onerror = () => resolve(null);
          image.src = definition.url;
        }),
      );
    }
    tracked.cache.set(
      key,
      tracked.cache.get(imageKey).then((image) => {
        if (!image || disposed()) return null;
        const [u, v, w, h] = region;
        const sourceWidth = image.width * w,
          sourceHeight = image.height * h;
        const limit = Math.min(
          renderer.capabilities.maxTextureSize,
          innerWidth < 650 ? 1536 : 2560,
        );
        const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        canvas
          .getContext('2d')
          .drawImage(
            image,
            image.width * u,
            image.height * (1 - v - h),
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvas.width,
            canvas.height,
          );
        const texture = new T.Texture(canvas);
        texture.colorSpace = T.SRGBColorSpace;
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.minFilter = T.LinearMipmapLinearFilter;
        texture.magFilter = T.LinearFilter;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        tracked.textures.add(texture);
        return texture;
      }),
    );
  }
  tracked.cache.get(key).then(attach);

  return material;
}

export function facadeMeshes(T, surfaces, material, model) {
  const positions = [],
    uv = [],
    indices = [];
  for (const p of surfaces) {
    const index = positions.length / 3;
    positions.push(...p.vertices.flat());
    uv.push(...p.uv.flat());
    indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, material);
  mesh.userData.model = model;
  mesh.receiveShadow = true;
  return mesh;
}

export function planarUV(geometry, units = 12) {
  const position = geometry.getAttribute('position'),
    uv = [];
  for (let i = 0; i < position.count; i++)
    uv.push(position.getX(i) / units, position.getZ(i) / units);
  geometry.setAttribute('uv', new position.constructor(new Float32Array(uv), 2));
  return geometry;
}

// Split every roof triangle at the ridge before raising it. Raising only perimeter
// vertices would leave a rectangular pitched roof completely flat.
export function pitchedRoofGeometry(T, triangulated, roof) {
  const position = triangulated.getAttribute('position'),
    index = triangulated.getIndex();
  const vertices = [],
    count = index ? index.count : position.count;
  const across = (p) => p[roof.axis === 'x' ? 2 : 0];
  const clip = (polygon, sign) => {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = (across(a) - roof.center) * sign,
        db = (across(b) - roof.center) * sign;
      if (da >= 0) result.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db);
        result.push(a.map((v, k) => v + (b[k] - v) * t));
      }
    }
    return result;
  };
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((offset) => {
      const n = index ? index.getX(i + offset) : i + offset;
      return [position.getX(n), 0, position.getZ(n)];
    });
    const crossing =
      triangle.some((p) => across(p) < roof.center) &&
      triangle.some((p) => across(p) > roof.center);
    const pieces = crossing ? [clip(triangle, 1), clip(triangle, -1)] : [triangle];
    for (const polygon of pieces)
      for (let n = 1; n + 1 < polygon.length; n++)
        for (const p of [polygon[0], polygon[n], polygon[n + 1]])
          vertices.push(
            p[0],
            roof.base + roof.rise * Math.max(0, 1 - Math.abs(across(p) - roof.center) / roof.half),
            p[2],
          );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  planarUV(geometry, 8);
  geometry.computeVertexNormals();
  return geometry;
}

export function disposeCampusDetail(group) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group?.traverse((m) => {
    if (m.geometry) geometries.add(m.geometry);
    for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      if (material.userData?.campusMap?.isTexture) textures.add(material.userData.campusMap);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => {
    t.source?.data?.close?.();
    t.dispose();
  });
}

export async function loadCampusDetail(T, asset, model, signal) {
  if (!asset.url?.startsWith('/shared/campus-assets/models/')) throw Error('建筑模型地址无效。');
  const response = await fetch(asset.url, { signal });
  if (!response.ok) throw Error('建筑细节暂时不可用。');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 32_000_000) throw Error('建筑模型过大。');
  const header = new DataView(buffer);
  if (buffer.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67)
    throw Error('建筑模型格式无效。');
  const { GLTFLoader } = await import('./vendor/three/GLTFLoader.js');
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith('blob:') && !url.startsWith('data:'))
      throw Error('建筑模型只能包含内嵌材质。');
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
  if (signal.aborted) {
    disposeCampusDetail(gltf.scene);
    throw Error('建筑载入已取消。');
  }
  const object = gltf.scene,
    bounds = new T.Box3().setFromObject(object),
    size = bounds.getSize(new T.Vector3());
  if (!Number.isFinite(size.length()) || size.y <= 0) {
    disposeCampusDetail(object);
    throw Error('建筑尺寸无效。');
  }
  const center = bounds.getCenter(new T.Vector3()),
    scale = model.height / size.y;
  object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  object.scale.setScalar(scale); // Uniform scaling keeps windows and facade proportions intact.
  const group = new T.Group();
  group.add(object);
  group.rotation.y = asset.rotation || 0;
  group.position.set(model.position[0], 0, model.position[2]);
  group.traverse((m) => {
    if (!m.isMesh) return;
    m.userData.model = model;
    m.castShadow = true;
    m.receiveShadow = true;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      mat.userData.campusMap = mat.map;
      mat.userData.detail = true;
      mat.side = T.DoubleSide;
      mat.roughness = 0.96;
      mat.metalness = 0;
    }
  });
  return group;
}
