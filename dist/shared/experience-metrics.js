import { diagnosticContext } from './diagnostic-context.js';
const metricNames = new Set(['inp', 'dock', 'photo-open', 'landing', 'upload']);
let sent = 0,
  installed = false;
const context = () => {
  const ua = navigator.userAgent || '';
  return {
    platform: 'web',
    device: /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : /iPad/i.test(ua) ? 'tablet' : 'desktop',
    os: /iPhone|iPad/i.test(ua)
      ? 'ios'
      : /Android/i.test(ua)
        ? 'android'
        : /Windows/i.test(ua)
          ? 'windows'
          : /Mac/i.test(ua)
            ? 'mac'
            : 'other',
    browser: /MicroMessenger/i.test(ua)
      ? 'wechat'
      : /Firefox/i.test(ua)
        ? 'firefox'
        : /Chrome|Chromium|Edg/i.test(ua)
          ? 'chromium'
          : /Safari/i.test(ua)
            ? 'safari'
            : 'other',
  };
};
export function reportExperience(metric, duration, { id, ok = true, dropped = 0, page } = {}) {
  try {
    if (sent >= 80 || !metricNames.has(metric) || !Number.isFinite(duration) || duration < 0)
      return;
    sent++;
    const data = {
      id: id || crypto.randomUUID(),
      metric,
      duration: Math.min(duration, 3600000),
      ok: !!ok,
      dropped: Math.max(0, Math.min(1, dropped)),
      page: page || diagnosticContext(location.hash).page,
      ...context(),
    };
    void fetch('/api/client-performance', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    /* Diagnostics never interrupt a user's operation. */
  }
}
export function operationStart(metric) {
  const at = performance.now(),
    page = diagnosticContext(location.hash).page;
  let done = false;
  return (ok = true, extras = {}) => {
    if (done) return;
    done = true;
    reportExperience(metric, performance.now() - at, { ok, page, ...extras });
  };
}
export function installExperienceMetrics() {
  if (installed) return;
  installed = true;
  globalThis.jingyuExperience820 = { start: operationStart, report: reportExperience };
  void import('/shared/vendor/web-vitals.js')
    .then(({ onINP }) =>
      onINP((m) => reportExperience('inp', m.value, { id: m.id }), { reportAllChanges: true }),
    )
    .catch(() => {});
  document.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest?.('#mobile-nav a')) return;
      const done = operationStart('dock');
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    },
    { capture: true, passive: true },
  );
}
