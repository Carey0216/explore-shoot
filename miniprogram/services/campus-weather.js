const api = require('./api');
let value = null,
  origin = '',
  at = 0,
  pending;
async function load() {
  const next = require('./network').configuredOrigin();
  if (next !== origin) {
    origin = next;
    value = null;
    at = 0;
    pending = null;
  }
  if (value && Date.now() - at < (value.available ? 20 * 60000 : 60000)) return value;
  if (pending) return pending;
  const backend = origin;
  pending = api
    .request('/api/weather')
    .then((data) => {
      if (origin === backend) {
        value = data;
        at = Date.now();
      }
      return data;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
function symbol(code) {
  return code >= 95
    ? '⛈️'
    : (code >= 71 && code <= 77) || code === 85 || code === 86
      ? '🌨️'
      : code >= 51
        ? '🌧️'
        : code >= 45
          ? '🌫️'
          : code >= 3
            ? '☁️'
            : code >= 1
              ? '🌤️'
              : '☀️';
}
module.exports = { load, symbol };
