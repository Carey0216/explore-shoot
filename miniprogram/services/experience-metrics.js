const allowed = new Set(['dock', 'photo-open', 'landing', 'upload']);
let count = 0;
function context() {
  let info = {};
  try {
    info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
  } catch (_) {}
  const os = String(info.platform || '').toLowerCase();
  return {
    platform: 'mini',
    device: /windows|mac|devtools/.test(os) ? 'desktop' : 'mobile',
    os: ['ios', 'android', 'windows', 'mac', 'devtools'].includes(os) ? os : 'other',
    browser: 'wechat',
    page: require('./diagnostic-context').diagnosticContext(
      typeof getCurrentPages === 'function' ? getCurrentPages().slice(-1)[0]?.route : 'unknown',
    ).page,
  };
}
function report(metric, duration, { ok = true, dropped = 0, page } = {}) {
  if (count >= 80 || !allowed.has(metric) || !Number.isFinite(duration) || duration < 0) return;
  count++;
  try {
    const data = {
      id: require('./model').uuid(),
      metric,
      duration: Math.min(duration, 3600000),
      ok: !!ok,
      dropped: Math.max(0, Math.min(1, dropped)),
      ...context(),
    };
    if (page) data.page = page;
    require('./api')
      .request('/api/client-performance', 'POST', data)
      .catch(() => {});
  } catch (_) {}
}
function start(metric) {
  const at = Date.now(),
    page = context().page;
  let done = false;
  return (ok = true, extras = {}) => {
    if (done) return;
    done = true;
    report(metric, Date.now() - at, { ok, page, ...extras });
  };
}
module.exports = { report, start };
