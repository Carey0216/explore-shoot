// Same local east/south metre frame as CampusModelService; storage remains WGS84.
function placementModel(scene, placement) {
  const [lng, lat, heading, scale, altitude] = ['lng', 'lat', 'heading', 'scale', 'altitude'].map(
    (k) => Number(placement[k]),
  );
  if (
    ![lng, lat, heading, scale, altitude].every(Number.isFinite) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90 ||
    Math.abs(heading) > 360 ||
    scale < 0.1 ||
    scale > 2 ||
    altitude < -20 ||
    altitude > 30
  )
    throw Error('模型位置、比例或朝向无效');
  const original = scene.models.find((m) => m.id === 'clock');
  if (!original?.meshAsset || !Array.isArray(scene.origin)) throw Error('钟楼模型资料尚未准备好');
  const [originLng, originLat] = scene.origin;
  return {
    ...original,
    name: '钟楼 · 配准预览',
    position: [
      (lng - originLng) * 111320 * Math.cos((originLat * Math.PI) / 180),
      altitude,
      (originLat - lat) * 111320,
    ],
    height: 80 * scale,
    extent: original.extent.map((n) => n * scale),
    meshAsset: { ...original.meshAsset, rotation: (-heading * Math.PI) / 180 },
  };
}
module.exports = { placementModel };
