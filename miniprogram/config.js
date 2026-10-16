let local = {};
try {
  local = require('./config.local');
} catch (_) {
  /* Private local configuration is optional. */
}
module.exports = { apiBase: '', development: false, ...local };
