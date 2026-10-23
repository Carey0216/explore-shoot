const entries = new Map();
function read(key, load, ttl = 30000) {
  const old = entries.get(key);
  if (old && old.until > Date.now()) return old.promise;
  const entry = { until: Date.now() + ttl, promise: Promise.resolve().then(load) };
  entries.set(key, entry);
  entry.promise.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  while (entries.size > 30) entries.delete(entries.keys().next().value);
  return entry.promise;
}
function clear() {
  entries.clear();
}
module.exports = { read, clear };
