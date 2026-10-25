import { toast } from './ui.js';
let flags = {};
export const featureOn = (key) => flags[key]?.enabled !== false;
export const featureVisible = (key) =>
  flags[key]?.visible !== false && (key !== 'support' || flags[key]?.visible === true);
export async function loadFeatures() {
  try {
    const res = await fetch(
      document.getElementById('app') ? '/api/admin/feature-visibility' : '/api/features',
      { credentials: 'same-origin', cache: 'no-store' },
    );
    if (res.ok) {
      flags = (await res.json()).features || {};
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('features:change'));
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
  if (document.getElementById('app')) return;
  const paths = {
    assistant: 'assistant',
    support: 'support',
    plans: 'plans',
    memories: 'memories',
    topics: 'topics',
    passport: 'passport',
    notifications: 'notifications',
    contact: 'messages',
    conversation: 'messages',
    publish: 'publishing',
    checkin: 'publishing',
    collections: 'plans',
    topic: 'topics',
    notice: 'notifications',
    active: 'exploration',
    guides: 'exploration',
    guide: 'exploration',
    routes: 'exploration',
  };
  if (!document.getElementById('app'))
    root.querySelectorAll('a[href^="#"]').forEach((a) => {
      const key = paths[a.getAttribute('href').slice(1).split('/')[0]];
      if (key) {
        a.dataset.feature = key;
        a.hidden = !featureVisible(key);
      }
    });
  root
    .querySelectorAll('#campus-panorama-open,#campus-panorama')
    .forEach((el) => (el.dataset.feature = 'panorama'));
  root
    .querySelectorAll(
      '#campus-model-open,#campus-model,#passport-3d,[data-model-preview],.map-model-calibration',
    )
    .forEach((el) => (el.dataset.feature = 'campus-3d'));
  root
    .querySelectorAll('.map-dimension-toggle,.map-view-switch')
    .forEach((el) => (el.dataset.feature = 'map-3d'));
  const selectors = {
    exploration: '.support-plan-entry',
    reactions: '.point-reactions',
    bookmarks: '[data-save]',
    feedback: '#place-report,.map-report,[data-work-report]',
    scout: '#apply-scout',
    assistant: '#campus-assistant-open',
    support: '.support-orb',
    publishing: '#record-open,#place-checkin,[data-checkin]',
    'work-wall': '[data-share-checkin],.wall-opt-in',
  };
  if (!document.getElementById('app'))
    for (const [key, selector] of Object.entries(selectors))
      root.querySelectorAll(selector).forEach((el) => (el.dataset.feature = key));
  root.querySelectorAll('[data-feature]').forEach((el) => {
    el.hidden = !featureVisible(el.dataset.feature);
    el.dataset.featureMaintenance = String(!featureOn(el.dataset.feature));
  });
  const dock = document.getElementById('mobile-nav');
  if (dock) {
    const count = [...dock.children].filter((el) => el.matches('a,button') && !el.hidden).length;
    dock.style.gridTemplateColumns =
      count === 5 ? '' : `repeat(${Math.max(1, count)},minmax(0,1fr))`;
    dock.classList.toggle('dock-reflow', count !== 5);
  }
}

export const maintenanceMessage = '功能正在维护中，敬请期待…';
export function featureForRoute(route) {
  return {
    support: 'support',
    assistant: 'assistant',
    plans: 'plans',
    collections: 'plans',
    memories: 'memories',
    'shared-plan': 'plans',
    topics: 'topics',
    topic: 'topics',
    passport: 'passport',
    notifications: 'notifications',
    notice: 'notifications',
    contact: 'messages',
    conversation: 'messages',
    publish: 'publishing',
    checkin: 'publishing',
    routes: 'exploration',
    active: 'exploration',
    guides: 'exploration',
    guide: 'exploration',
  }[String(route).replace(/^#/, '').split(/[/?]/)[0]];
}
export function allowFeature(key) {
  if (!key || (featureOn(key) && featureVisible(key))) return true;
  toast(maintenanceMessage, { center: true });
  return false;
}
// Capture before local click handlers: a visible, closed feature stays tappable for maintenance feedback.
if (typeof document !== 'undefined')
  document.addEventListener(
    'click',
    (e) => {
      if (document.getElementById('app')) return;
      const el = e.target.closest?.('[data-feature]');
      const key = el?.dataset.feature;
      if (key && (!featureOn(key) || !featureVisible(key))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toast(maintenanceMessage, { center: true });
      }
    },
    true,
  );
