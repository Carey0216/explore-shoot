let flags = {};
export const featureOn = (key) => flags[key]?.enabled !== false;
export const featureVisible = (key) =>
  featureOn(key) &&
  flags[key]?.visible !== false &&
  (key !== 'support' || flags[key]?.visible === true);
export async function loadFeatures() {
  try {
    const res = await fetch('/api/features', { credentials: 'same-origin', cache: 'no-store' });
    if (res.ok) {
      flags = (await res.json()).features || {};
      try {
        localStorage.setItem('campus-offline-enabled', String(featureOn('offline')));
        if (!featureOn('offline')) {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('campus-public-v7:'))
            .forEach((k) => localStorage.removeItem(k));
          navigator.serviceWorker
            ?.getRegistrations()
            .then((all) =>
              all
                .filter((r) => r.active?.scriptURL === location.origin + '/offline-worker.js')
                .forEach((r) => r.unregister()),
            );
        }
      } catch {}
    }
  } catch {}
  return flags;
}
export function applyFeatureEntries(root = document) {
  const paths = {
    assistant: 'assistant',
    support: 'support',
    plans: 'plans',
    topics: 'topics',
    passport: 'passport',
    notifications: 'notifications',
    publish: 'publishing',
    routes: 'exploration',
  };
  root.querySelectorAll('a[href^="#"]').forEach((a) => {
    const key = paths[a.getAttribute('href').slice(1).split('/')[0]];
    if (key) a.hidden = !featureVisible(key);
  });
  root.querySelectorAll('[data-feature]').forEach((el) => {
    el.hidden = !featureVisible(el.dataset.feature);
  });
}
