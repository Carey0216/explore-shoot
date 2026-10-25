export const needsFullOverview = (page) =>
  ![
    'overview',
    'inbox',
    'messages',
    'review-queue',
    'settings',
    'features',
    'ai-settings',
    'scout-quiz',
    'preflight',
    'weather',
  ].includes(page);

// Full and compact responses have different contracts. Never cache them as one payload.
export function createOverviewLoader(request) {
  let account = '',
    generation = 0;
  const cache = new Map(),
    pending = new Map(),
    requests = new Map();
  return {
    reset(id) {
      if (account === id) return;
      account = id;
      generation++;
      cache.clear();
      pending.clear();
      requests.clear();
    },
    async load(full, force = false) {
      const key = full ? 'full' : 'compact',
        stamp = generation;
      if (!force && cache.has(key) && Date.now() - cache.get(key).at < 15000)
        return cache.get(key).data;
      if (!force && pending.has(key)) return pending.get(key);
      const requestId = (requests.get(key) || 0) + 1;
      requests.set(key, requestId);
      const work = request('/api/admin/overview' + (full ? '' : '?compact=1'))
        .then((data) => {
          if (generation !== stamp) throw Error('管理账号已改变，请重新载入');
          if (requests.get(key) === requestId) cache.set(key, { data, at: Date.now() });
          return data;
        })
        .finally(() => {
          if (generation === stamp && requests.get(key) === requestId) pending.delete(key);
        });
      pending.set(key, work);
      return work;
    },
  };
}
