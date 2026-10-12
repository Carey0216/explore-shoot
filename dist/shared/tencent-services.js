import { toTencent, fromTencent } from './coordinates.js';
import { distance } from './routing.js';

const cache = new Map(),
  pending = new Map();
let queue = Promise.resolve(),
  lastRequest = 0;
const unavailable = (reason) => ({ available: false, provider: 'tencent', reason });
export function serviceError(error) {
  const status = Number(error?.status);
  if (status === 199) return '腾讯 Key 未开启 WebService API，请联系管理员启用步行路线规划服务';
  if (status === 120) return '腾讯路线请求频率达到上限，请稍后重试';
  if (status === 121) return '腾讯步行每日额度已达到上限，请管理员检查当前 Key 的额度分配';
  if (status === 190) return '腾讯地图 Key 无效，请联系管理员检查';
  if ([110, 111, 112, 113].includes(status))
    return '腾讯路线请求未获授权，请管理员检查域名、服务权限或签名设置';
  if ([333, 377, 378].includes(status))
    return '腾讯暂未覆盖此起终点的可步行路线，请选择附近的开放道路入口';
  return Number.isFinite(status)
    ? '腾讯步行服务暂不可用（状态 ' + status + '），请检查权限、额度或起终点'
    : '腾讯步行服务连接失败，请检查网络后重试';
}
export function tencentLeg(response, start, target) {
  if (response?.status !== 0)
    return { ...unavailable(serviceError(response)), status: Number(response?.status) };
  const route = response.result?.routes?.[0];
  if (
    !route ||
    !Array.isArray(route.polyline) ||
    route.polyline.length < 2 ||
    !Number.isFinite(route.distance) ||
    route.distance < 0 ||
    !Number.isFinite(route.duration) ||
    route.duration < 0
  )
    return unavailable('腾讯暂未返回可用步行路线，请换一个附近入口或使用腾讯地图 App');
  let path;
  try {
    path = route.polyline.map((p) => {
      const c = fromTencent({ lat: p.getLat(), lng: p.getLng() });
      return [c.lng, c.lat];
    });
  } catch {
    return unavailable('腾讯返回的路线坐标不可用，请重试');
  }
  const endGap = distance(path.at(-1), target),
    startGap = distance(path[0], start);
  // Keep the provider's actual route; never invent a road or a straight connector.
  const steps = (route.steps || []).map((s) => ({
    instruction: String(s.instruction || ''),
    road: String(s.road_name || ''),
    distance: Number(s.distance) || 0,
    action: String(s.act_desc || ''),
    indices: s.polyline_idx,
  }));
  return {
    available: true,
    provider: 'tencent',
    path,
    connectors: [],
    length: route.distance,
    lengthWithApproach: route.distance,
    duration: route.duration,
    approach: endGap,
    startGap,
    endGap,
    steps,
  };
}
export async function tencentWalking(T, key, start, target, { alive = () => true } = {}) {
  if (!alive()) return unavailable('地图页面已关闭');
  if (!T.service?.Walking) return unavailable('腾讯步行服务未加载，请刷新页面重试');
  const a = toTencent(start),
    b = toTencent(target),
    id = key + ':' + [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(6)).join(',');
  const stored = cache.get(id);
  if (stored && stored.expires > Date.now()) return structuredClone(stored.leg);
  if (pending.has(id)) return structuredClone(await pending.get(id));
  const request = queue
    .catch(() => {})
    .then(async () => {
      if (!alive()) return unavailable('地图页面已关闭');
      const delay = Math.max(0, 450 - (Date.now() - lastRequest));
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (!alive()) return unavailable('地图页面已关闭');
      lastRequest = Date.now();
      let timer;
      try {
        const response = await Promise.race([
          new T.service.Walking().search({
            from: new T.LatLng(a.lat, a.lng),
            to: new T.LatLng(b.lat, b.lng),
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('timeout')), 12000);
          }),
        ]);
        const leg = tencentLeg(response, start, target);
        if (leg.available) {
          cache.set(id, { leg, expires: Date.now() + 300000 });
          if (cache.size > 50) cache.delete(cache.keys().next().value);
        }
        return leg;
      } catch (error) {
        return {
          ...unavailable(serviceError(error)),
          status: Number.isFinite(Number(error?.status)) ? Number(error.status) : undefined,
        };
      } finally {
        clearTimeout(timer);
      }
    });
  queue = request;
  pending.set(id, request);
  try {
    return structuredClone(await request);
  } finally {
    pending.delete(id);
  }
}
