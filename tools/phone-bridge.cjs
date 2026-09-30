// Opt-in phone access. The application and administrator listeners stay local.
const http = require('node:http');
const os = require('node:os');
function lanAddresses() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, items]) =>
    (items || []).filter(a => a.family === 'IPv4' && !a.internal && !a.address.startsWith('198.18.'))
      .map(a => ({ name, address: a.address })));
}
function createBridge({ origin, bind = '127.0.0.1', port = 4178, upstreamPort = 4174 }) {
  const entry = new URL(origin);
  if (!['http:', 'https:'].includes(entry.protocol) || entry.origin !== origin || entry.username || entry.password)
    throw Error('Provide an exact HTTP or HTTPS origin without a path.');
  const secure = entry.protocol === 'https:';
  return http.createServer((req, res) => {
    const reject = (status, error) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error })); };
    if (req.headers.host !== entry.host) return reject(403, '手机测试入口域名不匹配');
    if (req.headers.origin && req.headers.origin !== origin) return reject(403, '请求来源不允许');
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin)
      return reject(403, '操作需要来自本测试页面');
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return reject(400, '地址无效');
    if (/^\/(?:api\/admin(?:\/|$)|admin(?:\/|$))/.test(req.url)) return reject(404, '页面不存在');
    if (req.url === '/__phone_health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ app: 'explore-shoot-phone', origin, secure }));
    }
    const headers = { ...req.headers, host: `127.0.0.1:${upstreamPort}`, connection: 'close' };
    delete headers['forwarded']; delete headers['x-forwarded-host']; delete headers['x-forwarded-proto']; delete headers['x-forwarded-for'];
    if (req.headers.origin) headers.origin = `http://127.0.0.1:${upstreamPort}`;
    // Do not pass a same-host administrator cookie to the user service.
    headers.cookie = (req.headers.cookie || '').split(';').filter(c => c.trim().startsWith('nmu_user=')).join(';');
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method, headers }, response => {
      const outgoing = { ...response.headers };
      if (outgoing['set-cookie'] && secure)
        outgoing['set-cookie'] = outgoing['set-cookie'].map(c => /;\s*Secure(?:;|$)/i.test(c) ? c : c + '; Secure');
      if (secure) outgoing['strict-transport-security'] = 'max-age=3600';
      res.writeHead(response.statusCode, outgoing);
      response.pipe(res);
    });
    upstream.setTimeout(30000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) reject(502, '本地项目未启动，请先启动项目'); else res.destroy(); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  });
}
if (require.main === module) {
  if (process.argv.includes('--list-addresses')) {
    console.log(JSON.stringify(lanAddresses()));
  } else {
    const address = process.argv.find(a => a.startsWith('--lan='))?.slice(6);
    if (address && !lanAddresses().some(a => a.address === address)) throw Error('Choose an IPv4 address on this computer.');
    const publicTest = process.argv.includes('--public');
    const origin = address ? `http://${address}:4178` : process.env.PUBLIC_TEST_ORIGIN;
    if (!origin) throw Error('Use --lan=YOUR_IPV4 or set PUBLIC_TEST_ORIGIN to the approved HTTPS URL.');
    if (!address && (!publicTest || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)))
      throw Error('Public mode requires --public and an exact approved trycloudflare HTTPS origin.');
    const bind = address || '127.0.0.1';
    const port = publicTest ? 4179 : 4178;
    const server = createBridge({ origin, bind });
    server.on('error', e => { console.error(e.message); process.exitCode = 1; });
    server.listen(port, bind, () => console.log(`Phone test: ${origin}\nAdmin remains local on port 4176.`));
  }
}
module.exports = { createBridge, lanAddresses };
