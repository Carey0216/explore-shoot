const seen = new Set();
let count = 0;
function report(kind) {
  if (count >= 12 || seen.has(kind)) return;
  seen.add(kind);
  count++;
  require('./api')
    .request('/api/client-health', 'POST', { kind, platform: 'mini' })
    .catch(() => {});
}
module.exports = { report };
