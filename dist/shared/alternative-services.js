import { toTencent, fromTencent, toBaidu, fromBaidu } from './coordinates.js';
import { distance } from './routing.js';
const point = (value) =>
  Array.isArray(value)
    ? { lng: value[0], lat: value[1] }
    : {
        lng: typeof value.getLng === 'function' ? value.getLng() : value.lng,
        lat: typeof value.getLat === 'function' ? value.getLat() : value.lat,
      };
export function normalizeAlternative(provider, route, start, target) {
  const convert = provider === 'baidu' ? fromBaidu : fromTencent;
  const steps = route.steps || [],
    raw = provider === 'baidu' ? route.path : steps.flatMap((s) => s.path || []);
  if (
    !Array.isArray(raw) ||
    raw.length < 2 ||
    !Number.isFinite(route.distance) ||
    route.distance < 0 ||
    !Number.isFinite(route.duration) ||
    route.duration < 0
  )
    return { available: false, provider, reason: '地图服务未返回可用步行路线' };
  const path = raw.map((p) => {
    const c = convert(point(p));
    return [c.lng, c.lat];
  });
  return {
    available: true,
    provider,
    path,
    connectors: [],
    length: route.distance,
    lengthWithApproach: route.distance,
    duration: route.duration / 60,
    approach: distance(path.at(-1), target),
    startGap: distance(path[0], start),
    endGap: distance(path.at(-1), target),
    steps: steps.map((s) => ({
      instruction: String(s.instruction || '').replace(/<[^>]*>/g, ''),
      road: String(s.road || ''),
      distance: Number(s.distance) || 0,
      action: String(s.action || ''),
    })),
  };
}
export function alternativeWalking(provider, sdk, start, target, { alive = () => true } = {}) {
  return new Promise((resolve) => {
    if (!alive()) return resolve({ available: false, provider, reason: '路线请求已取消' });
    let settled = false,
      service;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      service?.clearResults?.();
      resolve(alive() ? value : { available: false, provider, reason: '路线请求已取消' });
    };
    const timer = setTimeout(
      () => done({ available: false, provider, reason: '步行规划超时，请重试' }),
      15000,
    );
    try {
      if (provider === 'amap') {
        const a = toTencent(start),
          b = toTencent(target);
        service = new sdk.Walking({ hideMarkers: true });
        service.search([a.lng, a.lat], [b.lng, b.lat], (status, result) => {
          try {
            done(
              status === 'complete' && result.routes?.[0]
                ? normalizeAlternative(provider, result.routes[0], start, target)
                : {
                    available: false,
                    provider,
                    reason: '高德未返回可用步行路线，请检查 Key、权限及通行入口',
                  },
            );
          } catch {
            done({ available: false, provider, reason: '高德返回的路线坐标不可用' });
          }
        });
      } else {
        const a = toBaidu(start),
          b = toBaidu(target);
        service = new sdk.WalkingRoute(new sdk.Point(a.lng, a.lat), {
          onSearchComplete: (result) => {
            try {
              if (service.getStatus() !== 0 || !result?.getNumPlans())
                return done({
                  available: false,
                  provider,
                  reason: '百度未返回可用步行路线，请检查 AK、权限及通行入口',
                });
              const plan = result.getPlan(0),
                path = [],
                steps = [];
              for (let i = 0; i < plan.getNumRoutes(); i++) {
                const route = plan.getRoute(i);
                path.push(...route.getPath());
                for (let j = 0; j < route.getNumSteps(); j++) {
                  const step = route.getStep(j);
                  steps.push({
                    instruction: step.getDescription(false),
                    distance: step.getDistance(false),
                  });
                }
              }
              done(
                normalizeAlternative(
                  provider,
                  {
                    path,
                    steps,
                    distance: plan.getDistance(false),
                    duration: plan.getDuration(false),
                  },
                  start,
                  target,
                ),
              );
            } catch {
              done({ available: false, provider, reason: '百度返回的路线坐标不可用' });
            }
          },
        });
        service.search(new sdk.Point(a.lng, a.lat), new sdk.Point(b.lng, b.lat));
      }
    } catch {
      done({ available: false, provider, reason: '步行 SDK 未就绪，请刷新重试' });
    }
  });
}
