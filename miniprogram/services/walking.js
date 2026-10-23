const { toTencent, fromTencent } = require('./coordinates'),
  { distance } = require('./routing');
const unavailable = (reason) => ({ available: false, provider: 'tencent', reason });
function serviceError(error) {
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
function tencentLeg(response, start, target) {
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
  const endGap = distance(path[path.length - 1], target),
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
// Fixed provider origin; application bearer credentials are never sent to a map vendor.
const cache = new Map();
let queue = Promise.resolve(),
  lastRequest = 0;
function decode(raw) {
  if (raw?.status !== 0) return raw;
  const r = raw.result?.routes?.[0];
  if (!r || !Array.isArray(r.polyline) || r.polyline.length < 4 || r.polyline.length > 100000)
    throw Error('步行路线坐标无效');
  const a = r.polyline.slice();
  for (let i = 2; i < a.length; i++) a[i] = a[i - 2] + a[i] / 1000000;
  r.polyline = [];
  for (let i = 0; i < a.length; i += 2) {
    const lat = a[i],
      lng = a[i + 1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw Error('步行坐标无效');
    r.polyline.push({ getLat: () => lat, getLng: () => lng });
  }
  return raw;
}
async function tencentWalking(_, key, start, target, { alive = () => true } = {}) {
  if (!key) return unavailable('地图服务尚未配置，可使用微信导航');
  const a = toTencent(start),
    b = toTencent(target),
    id = [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(5)).join(',');
  if (cache.has(id) && cache.get(id).until > Date.now()) return cache.get(id).value;
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (!alive()) return unavailable('页面已关闭');
      const delay = 450 - (Date.now() - lastRequest);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (!alive()) return unavailable('页面已关闭');
      lastRequest = Date.now();
      try {
        const raw = await new Promise((resolve, reject) =>
          wx.request({
            url: 'https://apis.map.qq.com/ws/direction/v1/walking/',
            data: { from: a.lat + ',' + a.lng, to: b.lat + ',' + b.lng, key, output: 'json' },
            timeout: 15000,
            success: (r) => resolve(r.data),
            fail: reject,
          }),
        );
        const result = tencentLeg(decode(raw), start, target);
        if (result.available) {
          cache.set(id, { until: Date.now() + 300000, value: result });
          while (cache.size > 30) cache.delete(cache.keys().next().value);
        }
        return result;
      } catch (e) {
        return unavailable(e.message || '步行路线暂不可用，请重试或使用微信导航');
      }
    });
  queue = task;
  return task;
}
// Vendor Web-service credentials remain on the same backend as the shared accounts.
const nativeCache = new Map();
async function miniWalking(T, key, start, target, { alive = () => true } = {}) {
  const api = require('./api'),
    identity = api.identity();
  try {
    const config = await api.cached('/api/maps/mini-config', 5000);
    if (!alive() || identity !== api.identity()) return unavailable('路线请求已取消');
    if (!config.configured)
      return {
        available: false,
        provider: config.provider,
        reason: '地图路线服务尚未配置，请联系管理员',
      };
    const id = [
      identity,
      config.provider,
      config.revision,
      start.lng,
      start.lat,
      target.lng,
      target.lat,
    ].join(':');
    const saved = nativeCache.get(id);
    if (saved?.until > Date.now()) return saved.value;
    const result = await api.request('/api/maps/walking', 'POST', {
      start: toTencent(start),
      target: toTencent(target),
    });
    if (!alive() || identity !== api.identity()) return unavailable('路线请求已取消');
    if (
      !result.available ||
      result.coordinateSystem !== 'GCJ02' ||
      !Array.isArray(result.path) ||
      result.path.length < 2
    )
      throw Error('步行路线坐标无效');
    const path = result.path.map((p) => {
      const c = fromTencent(p);
      return [c.lng, c.lat];
    });
    const value = {
      ...result,
      path,
      connectors: [],
      lengthWithApproach: result.length,
      startGap: distance(path[0], start),
      endGap: distance(path[path.length - 1], target),
      approach: distance(path[path.length - 1], target),
    };
    nativeCache.set(id, { until: Date.now() + 300000, value });
    while (nativeCache.size > 30) nativeCache.delete(nativeCache.keys().next().value);
    return value;
  } catch (e) {
    return { available: false, reason: e.message || '步行路线暂不可用，请重试' };
  }
}
module.exports = { tencentWalking, miniWalking, tencentLeg, serviceError, decode };
