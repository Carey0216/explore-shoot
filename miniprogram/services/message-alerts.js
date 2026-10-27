const { createMessageQueue } = require('./message-alert-state');
const queue = createMessageQueue(),
  listeners = new Set();
let scope = '',
  visit = 0,
  cursor = '',
  busy = false,
  polling,
  rotation,
  displayed = '';
const identity = () => {
  const s = require('./api').session();
  return s
    ? require('./network').configuredOrigin() + ':' + s.account.id + ':' + s.token + ':' + visit
    : '';
};
const enabled = () => {
  const f = require('./features');
  return f.visible('messages') && f.enabled('messages');
};
function publish() {
  const item = scope && listeners.size && enabled() ? queue.next() : null;
  for (const fn of listeners) fn(item ? { ...item, remaining: queue.count() - 1 } : null);
  if (!item) {
    clearTimeout(rotation);
    displayed = '';
    return;
  }
  if (displayed !== item.id) {
    clearTimeout(rotation);
    displayed = item.id;
    rotation = setTimeout(dismiss, 8000);
  }
}
function reset() {
  scope = '';
  cursor = '';
  displayed = '';
  queue.reset('');
  clearTimeout(rotation);
  for (const fn of listeners) fn(null);
}
function newVisit() {
  visit++;
  reset();
}
function dismiss() {
  clearTimeout(rotation);
  displayed = '';
  queue.dismiss();
  publish();
}
async function refresh() {
  const nextScope = identity();
  if (nextScope !== scope) {
    scope = nextScope;
    cursor = '';
    displayed = '';
    queue.reset(scope);
    clearTimeout(rotation);
    publish();
  }
  if (!scope || !listeners.size || !enabled() || busy) {
    publish();
    return;
  }
  busy = true;
  const expected = scope;
  try {
    const api = require('./api');
    let page = await api.request('/api/notifications?category=message');
    if (expected !== identity() || expected !== scope) return;
    queue.ingest(page.items);
    let next = cursor || page.next;
    for (let i = 0; next && i < 8; i++) {
      page = await api.request(
        '/api/notifications?category=message&before=' + encodeURIComponent(next),
      );
      if (expected !== identity() || expected !== scope) return;
      queue.ingest(page.items);
      next = page.next;
    }
    cursor = next || '';
    publish();
  } catch (e) {
    if (e.status === 401) reset();
  } finally {
    busy = false;
  }
}
function subscribe(fn) {
  try {
    getApp().globalData.messageAlertsReset = reset;
  } catch (_) {}
  listeners.add(fn);
  if (!polling) polling = setInterval(refresh, 5000);
  void refresh();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearInterval(polling);
      polling = null;
      clearTimeout(rotation);
      displayed = '';
    }
  };
}
module.exports = { subscribe, refresh, dismiss, reset, newVisit };
