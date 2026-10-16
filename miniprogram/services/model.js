const conditions = [
  { id: '', name: '全部' },
  { id: 'night', name: '夜景' },
  { id: 'portrait', name: '人像' },
  { id: 'architecture', name: '建筑' },
  { id: 'rain', name: '雨天' },
  { id: 'solo', name: '独自拍' },
];
function uuid() {
  // Submission identifiers are for idempotency only, never authentication credentials.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
function distance(a, b) {
  const r = Math.PI / 180;
  return (
    12742000 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2,
        ),
      ),
    )
  );
}
function pointView(point) {
  return { ...point, photo: point.cover || '', spots: point.matchingSpots || [] };
}
function nearby(points, location) {
  return points
    .map((p) => ({ ...p, distance: Math.round(distance(location, p)) }))
    .sort(
      (a, b) =>
        Number(a.myReaction === 'dislike') - Number(b.myReaction === 'dislike') ||
        a.distance - b.distance,
    );
}
function location(type = 'wgs84') {
  return new Promise((resolve, reject) =>
    wx.getLocation({
      type,
      success(p) {
        resolve({ lng: p.longitude, lat: p.latitude, accuracy: p.accuracy, at: Date.now() });
      },
      fail() {
        reject(Error('未取得位置，可授权定位后重试，也可继续浏览'));
      },
    }),
  );
}
const availability = {
  unknown: '开放情况待确认',
  open: '正常开放',
  limited: '通行受限',
  closed: '暂时关闭',
};
module.exports = { conditions, uuid, distance, pointView, nearby, location, availability };
