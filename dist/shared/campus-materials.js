// Atlas repetition happens per fragment, never by wrapping each triangle's UV vertices.
// That keeps horizontal window rows continuous across both triangles of a facade.
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
  const rect = region.map((n) => n.toFixed(8));
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
      vec2 campusUv=vec2(${rect[0]},${rect[1]})+(0.002+fract(vMapUv)*0.996)*vec2(${rect[2]},${rect[3]});
      diffuseColor *= textureGrad(map,campusUv,dFdx(vMapUv)*vec2(${rect[2]},${rect[3]}),dFdy(vMapUv)*vec2(${rect[2]},${rect[3]}));
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'campus-atlas-' + rect.join('-');
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
  if (tracked.cache.has(definition.url)) {
    tracked.cache.get(definition.url).then(attach);
    return material;
  }
  let resolveTexture;
  const promise = new Promise((resolve) => (resolveTexture = resolve));
  tracked.cache.set(definition.url, promise);
  promise.then(attach);
  const image = new Image();
  tracked.images.push(image);
  image.onload = () => {
    if (disposed()) return;
    const limit = Math.min(renderer.capabilities.maxTextureSize, innerWidth < 650 ? 1536 : 2560);
    let source = image;
    if (Math.max(image.width, image.height) > limit) {
      source = document.createElement('canvas');
      const scale = limit / Math.max(image.width, image.height);
      source.width = Math.round(image.width * scale);
      source.height = Math.round(image.height * scale);
      source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
    }
    const texture = new T.Texture(source);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    tracked.textures.add(texture);
    resolveTexture(texture);
  };
  image.onerror = () => {
    resolveTexture(null);
    if (!disposed()) render();
  };
  image.src = definition.url;
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
