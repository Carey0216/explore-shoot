// Shared mathematical algorithms ported from dist/shared/campus-materials.js.
function campusOverview(T, models, aspect, fov = 45, elevation = 0.85) {
  if (!models.length || !Number.isFinite(aspect) || aspect <= 0) throw Error('校园总览范围无效。');
  const bounds = new T.Box3();
  for (const m of models) {
    const [x, , z] = m.position,
      [w, h, d] = m.extent;
    bounds.expandByPoint(new T.Vector3(x - w / 2 - 50, 0, z - d / 2 - 50));
    bounds.expandByPoint(new T.Vector3(x + w / 2 + 50, h, z + d / 2 + 50));
  }
  const target = bounds.getCenter(new T.Vector3());
  if (!Number.isFinite(elevation) || elevation <= 0) throw Error('校园总览范围无效。');
  const direction = new T.Vector3(0, elevation, 1).normalize();
  const right = new T.Vector3(1, 0, 0);
  const up = new T.Vector3().crossVectors(direction, right).normalize();
  const tanVertical = Math.tan((fov * Math.PI) / 360);
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new T.Vector3(x, y, z).sub(target);
        distance = Math.max(
          distance,
          corner.dot(direction) + Math.abs(corner.dot(right)) / (tanVertical * aspect),
          corner.dot(direction) + Math.abs(corner.dot(up)) / tanVertical,
        );
      }
  return {
    target,
    position: target.clone().add(direction.multiplyScalar(Math.max(150, distance * 1.08 + 20))),
  };
}

function facadeMeshes(T, surfaces, material, model) {
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

function planarUV(geometry, units = 12) {
  const position = geometry.getAttribute('position'),
    uv = [];
  for (let i = 0; i < position.count; i++)
    uv.push(position.getX(i) / units, position.getZ(i) / units);
  geometry.setAttribute('uv', new position.constructor(new Float32Array(uv), 2));
  return geometry;
}

// Inverse of the image-to-view transformation used by the Java photo model service.
// Roofs and the background sample precisely the same original pixel, never a repeated tile.

function photoPlanarUV(geometry, { width, height, metresPerPixel }) {
  if (![width, height, metresPerPixel].every((n) => Number.isFinite(n) && n > 0))
    throw Error('影像坐标无效。');
  const position = geometry.getAttribute('position'),
    uv = [];
  for (let i = 0; i < position.count; i++)
    uv.push(
      0.5 - position.getZ(i) / (width * metresPerPixel),
      0.5 - position.getX(i) / (height * metresPerPixel),
    );
  geometry.setAttribute('uv', new position.constructor(new Float32Array(uv), 2));
  return geometry;
}

// Split every roof triangle at the ridge before raising it. Raising only perimeter
// vertices would leave a rectangular pitched roof completely flat.

function pitchedRoofGeometry(T, triangulated, roof) {
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

function disposeCampusDetail(group) {
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

module.exports = {
  campusOverview,
  facadeMeshes,
  planarUV,
  photoPlanarUV,
  pitchedRoofGeometry,
  disposeCampusDetail,
};
