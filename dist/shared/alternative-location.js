import { loadAlternative } from './alternative-sdk.js';
import { fromTencent } from './coordinates.js';
// SDK precise positioning on AMap; native high-accuracy WGS84 on Baidu to avoid its IP fallback.
let sequence = 0;
const watches = new Map();
export function alternativeLocation(catalog) {
  const once = (success, error, options = {}, alive = () => true) => {
    if (catalog.map.provider === 'baidu') {
      if (!navigator.geolocation) {
        error?.({ code: 2, message: '浏览器不支持精确定位' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (alive()) success(p);
        },
        (e) => {
          if (alive()) error?.(e);
        },
        { enableHighAccuracy: true, timeout: options.timeout || 20000, maximumAge: 0 },
      );
      return;
    }
    loadAlternative('amap', catalog.map)
      .then((sdk) => {
        if (!alive()) return;
        const geo = new sdk.Geolocation({
          enableHighAccuracy: true,
          timeout: options.timeout || 20000,
          maximumAge: 0,
          noIpLocate: 3,
          GeoLocationFirst: true,
          showButton: false,
          showMarker: false,
          showCircle: false,
          panToLocation: false,
          zoomToAccuracy: false,
        });
        geo.getCurrentPosition((status, result) => {
          if (!alive()) return;
          if (
            status !== 'complete' ||
            !result?.position ||
            !Number.isFinite(result.accuracy) ||
            result.accuracy <= 0 ||
            result.location_type === 'ip'
          ) {
            error?.({ code: 2, message: '高德未获得可靠的精确位置，请检查 HTTPS 和定位授权' });
            return;
          }
          try {
            const raw = { lng: result.position.getLng(), lat: result.position.getLat() },
              p = result.isConverted === false ? raw : fromTencent(raw);
            success({
              coords: { longitude: p.lng, latitude: p.lat, accuracy: result.accuracy },
              timestamp: Date.now(),
            });
          } catch {
            error?.({ code: 2, message: '定位坐标不可用' });
          }
        });
      })
      .catch(() => {
        if (alive()) error?.({ code: 2, message: '高德定位组件连接失败' });
      });
  };
  return {
    getCurrentPosition(success, error, options) {
      once(success, error, options);
    },
    watchPosition(success, error, options = {}) {
      const id = ++sequence,
        entry = { active: true, timer: null, native: null };
      watches.set(id, entry);
      if (catalog.map.provider === 'baidu') {
        if (!navigator.geolocation) {
          queueMicrotask(
            () => entry.active && error?.({ code: 2, message: '浏览器不支持精确定位' }),
          );
          return id;
        }
        entry.native = navigator.geolocation.watchPosition(
          (p) => entry.active && success(p),
          (e) => entry.active && error?.(e),
          { enableHighAccuracy: true, timeout: options.timeout || 20000, maximumAge: 0 },
        );
      } else {
        const tick = () => {
          if (!entry.active) return;
          once(
            (p) => {
              if (!entry.active) return;
              success(p);
              if (entry.active) entry.timer = setTimeout(tick, 5000);
            },
            (e) => {
              if (!entry.active) return;
              error?.(e);
              if (entry.active) entry.timer = setTimeout(tick, 5000);
            },
            options,
            () => entry.active,
          );
        };
        tick();
      }
      return id;
    },
    clearWatch(id) {
      const entry = watches.get(id);
      if (!entry) return;
      entry.active = false;
      clearTimeout(entry.timer);
      if (entry.native !== null) navigator.geolocation.clearWatch(entry.native);
      watches.delete(id);
    },
  };
}
