const { createBridge } = require('../tools/phone-bridge.cjs');
const http = require('node:http');
const assert = require('node:assert/strict');
let checks = 0;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
async function request(port, path = '/', headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, headers, method }, res => {
      let body = ''; res.on('data', b => body += b); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
}
(async () => {
  const received = [];
  const backend = http.createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': ['nmu_user=TEST; HttpOnly; SameSite=Strict; Path=/'] });
    res.end(JSON.stringify({ ok: true }));
  });
  const upstreamPort = await listen(backend);
  const bridge = createBridge({ origin: 'https://phone-test.example', upstreamPort });
  const port = await listen(bridge);
  const check = (a, b) => { assert.deepEqual(a, b); checks++; };
  try {
    check((await request(port, '/', { Host: 'evil.example' })).status, 403);
    check((await request(port, '/', { Host: 'phone-test.example', Origin: 'https://evil.example' })).status, 403);
    check((await request(port, '/api/auth/login', { Host: 'phone-test.example' }, 'POST')).status, 403);
    for (const path of ['/admin', '/admin/app.js', '/api/admin/overview'])
      check((await request(port, path, { Host: 'phone-test.example' })).status, 404);
    check(received.length, 0);
    const response = await request(port, '/api/auth/login', {
      Host: 'phone-test.example', Origin: 'https://phone-test.example',
      Cookie: 'nmu_admin=PRIVATE; nmu_user=USER', 'X-Forwarded-Host': 'admin.localhost', 'X-Forwarded-Proto': 'https',
    }, 'POST');
    check(response.status, 200);
    check(received[0].headers.host, `127.0.0.1:${upstreamPort}`);
    check(received[0].headers.origin, `http://127.0.0.1:${upstreamPort}`);
    check(received[0].headers.cookie.trim(), 'nmu_user=USER');
    check(received[0].headers['x-forwarded-host'], undefined);
    check(received[0].headers['x-forwarded-proto'], undefined);
    check(response.headers['set-cookie'][0].endsWith('; Secure'), true);
    check(JSON.parse((await request(port, '/__phone_health', { Host: 'phone-test.example' })).body).secure, true);
    check((await request(port, '//evil.example', { Host: 'phone-test.example' })).status, 400);
    console.log(`PASS: ${checks} phone bridge checks; origin validation, admin isolation, cookie privacy and HTTPS cookies.`);
  } finally { await close(bridge); await close(backend); }
})().catch(error => { console.error(error); process.exitCode = 1; });
