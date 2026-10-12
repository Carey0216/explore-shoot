import { toTencent } from './coordinates.js';
export function tencentLinks(target, origin, key, { mobile = false } = {}) {
  const to = toTencent(target),
    from = origin ? toTencent(origin) : null;
  const params = {
    type: 'walk',
    to: target.name,
    tocoord: to.lat.toFixed(6) + ',' + to.lng.toFixed(6),
    from: origin?.name || '当前位置',
    fromcoord: from ? from.lat.toFixed(6) + ',' + from.lng.toFixed(6) : 'CurrentLocation',
    referer: key || 'explore-shoot',
  };
  const native = mobile && key ? 'qqmap://map/routeplan?' + new URLSearchParams(params) : null;
  const webParams = { ...params, referer: 'explore-shoot' };
  if (!from) {
    delete webParams.from;
    delete webParams.fromcoord;
  }
  const markerName = String(target.name).replace(/[;|:]/g, ' ');
  const web =
    mobile || origin
      ? 'https://apis.map.qq.com/uri/v1/routeplan?' + new URLSearchParams(webParams)
      : 'https://apis.map.qq.com/uri/v1/marker?' +
        new URLSearchParams({
          marker:
            'coord:' +
            to.lat.toFixed(6) +
            ',' +
            to.lng.toFixed(6) +
            ';title:' +
            markerName +
            ';addr:北方民族大学',
          referer: 'explore-shoot',
        });
  return { native, web };
}
