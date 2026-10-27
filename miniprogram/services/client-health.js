const seen = new Set();
let count = 0;
function report(kind, resource = '', status = 0) {
  const page =
    typeof getCurrentPages === 'function'
      ? getCurrentPages().slice(-1)[0]?.route || 'unknown'
      : 'unknown';
  const context = require('./diagnostic-context').diagnosticContext(page, resource, status),
    key = kind + ':' + context.page + ':' + context.resource;
  if (count >= 30 || seen.has(key)) return;
  seen.add(key);
  count++;
  require('./api')
    .request('/api/client-health', 'POST', { kind, platform: 'mini', ...context })
    .catch(() => {});
}
module.exports = { report };
