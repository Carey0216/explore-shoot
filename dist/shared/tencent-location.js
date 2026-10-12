import { freshBrowserLocation } from './fresh-location.js';
import { fromTencent } from './coordinates.js';
import { alternativeLocation } from './alternative-location.js';
let loading = null,
  sequence = 0;
const watches = new Map();
function load() {
  if (window.LBS?.WebComponent?.Geolocation)
    return Promise.resolve(window.LBS.WebComponent.Geolocation);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const done = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        script.remove();
        loading = null;
        reject(error);
      } else resolve(window.LBS.WebComponent.Geolocation);
    };
    const timer = setTimeout(() => done(Error('腾讯定位组件加载超时')), 12000);
    script.src = 'https://mapapi.qq.com/web/lbs/h5-components/geolocation/geolocation.min.js';
    script.async = true;
    script.onload = () =>
      done(window.LBS?.WebComponent?.Geolocation ? null : Error('腾讯定位组件未就绪'));
    script.onerror = () => done(Error('腾讯定位组件连接失败'));
    document.head.append(script);
  });
  return loading;
}
function normalized(value) {
  if (value?.type === 'ip' || !Number.isFinite(value?.accuracy) || value.accuracy <= 0)
    throw Error('未获得可靠的精确位置');
  const p = fromTencent({ lng: value.lng, lat: value.lat });
  return {
    coords: { longitude: p.lng, latitude: p.lat, accuracy: value.accuracy },
    timestamp: Date.now(),
  };
}
const failure = (e) => {
  const codes = [Number(e?.status), ...(e?.logs || []).map((x) => Number(x.status))];
  return {
    code: codes.some((x) => [10101, 10302, 10305].includes(x))
      ? 1
      : codes.some((x) => [10002, 10103, 10402].includes(x))
        ? 3
        : 2,
    message: '腾讯定位暂不可用，请检查授权、HTTPS 和服务额度',
  };
};
// Same caller contract as browser geolocation, backed by Tencent's current H5 component.
// No IP fallback: a city-level IP position must never be used as a navigation fix.
export function locationFor(catalog) {
  if (['amap', 'baidu'].includes(catalog.map?.provider)) return alternativeLocation(catalog);
  // Tencent H5 uses this same browser sensor internally. Keep the sensor timestamp and
  // avoid reverse-geocoding/network work on every fix in ordinary Safari/Chrome.
  if (navigator.geolocation?.watchPosition && navigator.geolocation?.getCurrentPosition)
    return freshBrowserLocation();
  const key = catalog.map?.tencentKey;
  return {
    getCurrentPosition(success, error, options = {}) {
      if (!key) {
        error?.({ code: 2, message: '腾讯地图尚未配置' });
        return;
      }
      load()
        .then((Kind) => {
          const instance = new Kind({ key, referer: 'explore-shoot' });
          instance.getLocation(
            (value) => {
              try {
                success(normalized(value));
              } catch (e) {
                error?.(failure(e));
              }
            },
            (e) => error?.(failure(e)),
            { timeout: options.timeout || 20000, highAccuracy: true, maximumAge: 0 },
          );
        })
        .catch((e) => error?.(failure(e)));
    },
    watchPosition(success, error, options = {}) {
      const id = ++sequence,
        entry = { active: true, instance: null };
      watches.set(id, entry);
      if (!key) {
        queueMicrotask(() => {
          if (entry.active) error?.({ code: 2, message: '腾讯地图尚未配置' });
        });
        return id;
      }
      load()
        .then((Kind) => {
          if (!entry.active) return;
          entry.instance = new Kind({ key, referer: 'explore-shoot' });
          const config = {
            timeout: options.timeout || 20000,
            highAccuracy: true,
            maximumAge: options.maximumAge || 0,
          };
          const receive = (value) => {
            if (!entry.active) return;
            try {
              success(normalized(value));
            } catch (e) {
              error?.(failure(e));
            }
          };
          const fail = (e) => {
            if (entry.active) error?.(failure(e));
          };
          // The component's watch API does not report initial browser permission errors.
          // Request one precise fix first so denial/timeout reaches the caller reliably.
          entry.instance.getLocation(
            (value) => {
              if (!entry.active) return;
              receive(value);
              if (entry.active) entry.instance.watchPosition(receive, fail, config);
            },
            fail,
            config,
          );
        })
        .catch((e) => {
          if (entry.active) error?.(failure(e));
        });
      return id;
    },
    clearWatch(id) {
      const entry = watches.get(id);
      if (!entry) return;
      entry.active = false;
      entry.instance?.clearWatch();
      watches.delete(id);
    },
  };
}
