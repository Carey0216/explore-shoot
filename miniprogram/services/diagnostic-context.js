function fingerprint(value) {
  let n = 2166136261;
  for (let i = 0; i < String(value).length; i++)
    n = Math.imul(n ^ String(value).charCodeAt(i), 16777619);
  return (n >>> 0).toString(16).padStart(8, '0');
}
function diagnosticContext(route, resource = '', status = 0) {
  const parts = String(route || '')
    .replace(/^#/, '')
    .split(/[/?#]/)
    .filter(Boolean);
  const page = (parts[0] === 'pages' || parts[0] === 'scenes' ? parts[1] : parts[0]) || 'unknown';
  const path = String(resource || '')
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/admin(?=\/api\/)/, '');
  let safe = 'unknown';
  if (/^\/shared\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..')) safe = path;
  else if (path.startsWith('/api/') && !/\/(media|files|photo|avatar)(?:\/|$)/.test(path))
    safe = path
      .replace(/[a-f0-9-]{20,}/gi, '*')
      .replace(/[^a-zA-Z0-9_/*.-]/g, '')
      .slice(0, 150);
  else if (path)
    safe = (/\/messages\//.test(path) ? 'private-attachment' : 'image') + '@' + fingerprint(path);
  return {
    page: /^[a-z-]{1,40}$/.test(page) ? page : 'unknown',
    resource: safe.slice(0, 180),
    status: Number(status) || 0,
  };
}
module.exports = { diagnosticContext, fingerprint };
