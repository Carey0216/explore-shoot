// 当前地图使用在线 SDK；这里只保留前台导航需要的距离、方向与显示单位。
const rad = (d) => (d * Math.PI) / 180;
const pair = (p) => (Array.isArray(p) ? p : [p.lng, p.lat]);
export function distance(a, b) {
  a = pair(a);
  b = pair(b);
  const dlat = rad(b[1] - a[1]),
    dlng = rad(b[0] - a[0]);
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dlng / 2) ** 2,
        ),
      ),
    )
  );
}
export function direction(a, b) {
  a = pair(a);
  b = pair(b);
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1])),
    x =
      Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
      Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return {
    bearing,
    name: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(bearing / 45) % 8],
  };
}
export const meters = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + ' 公里' : Math.round(n) + ' 米');

// Official AMap mobile URI: dev=1 converts GPS coordinates; t=2 means walking.
