const config = require('../config');

function configuredOrigin() {
  return String(config.apiBase || '').replace(/\/$/, '');
}
function backendOrigin() {
  const value = configuredOrigin();
  const loopback = /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/.test(value);
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value) && !(config.development && loopback))
    throw Error('请先配置后端地址；手机调试请选择手机 HTTPS 配置');
  if (loopback) {
    let platform = '';
    try {
      platform = wx.getDeviceInfo ? wx.getDeviceInfo().platform : wx.getSystemInfoSync().platform;
    } catch (_) {}
    if (platform !== 'devtools')
      throw Error(
        '当前使用电脑本机地址，手机无法连接。请在电脑运行 npm run mini:start 切换手机 HTTPS 调试，再重新扫码',
      );
  }
  return value;
}
function failure(error = {}) {
  const detail = String(error.errMsg || '');
  let message;
  if (/domain.*list|url not in domain|合法域名/i.test(detail))
    message = '后端地址未通过微信合法域名校验。请使用已配置的域名；IP 地址仅供开启调试模式时测试';
  else if (/ssl|tls|certificate|cert\b/i.test(detail))
    message = 'HTTPS 证书或 TLS 校验失败，请检查服务器证书与设备时间';
  else if (/timeout|timed out/i.test(detail)) message = '连接后端超时，请稍后重试或切换网络';
  else message = '暂时连接不到后端，请检查网络或稍后重试';
  const errorResult = Error(message);
  errorResult.network = true;
  return errorResult;
}
module.exports = { configuredOrigin, backendOrigin, failure };
