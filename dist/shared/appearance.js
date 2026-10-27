// Blocking, dependency-free bootstrap: resolve the canvas before the first paint.
// Only the last appearance is cached here; account identity and content never are.
(() => {
  const root = document.documentElement;
  const key = 'explore-appearance-v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let preference = 'system',
    ready = false,
    timer,
    transition;
  const valid = (value) => ['system', 'light', 'dark'].includes(value);
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (valid(saved?.appearance)) preference = saved.appearance;
    else if (!saved) {
      const guest = JSON.parse(localStorage.getItem('explore-guest-preferences-v1'));
      if (valid(guest?.appearance)) preference = guest.appearance;
    }
  } catch {
    /* A blocked store must not prevent system appearance. */
  }
  function apply() {
    const next = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    const changed = root.dataset.appearance && root.dataset.appearance !== next;
    if (ready && changed && !reduced.matches) {
      root.classList.add('appearance-changing');
      clearTimeout(timer);
      timer = setTimeout(() => root.classList.remove('appearance-changing'), 240);
    } else if (reduced.matches) root.classList.remove('appearance-changing');
    const paint = () => {
      root.dataset.appearance = next;
      root.dataset.appearancePreference = preference;
      root.style.colorScheme = next;
      if (typeof CustomEvent !== 'undefined')
        window.dispatchEvent(
          new CustomEvent('appearance:change', { detail: { appearance: next } }),
        );
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', next === 'dark' ? '#000000' : '#f5f7f5');
    };
    transition?.skipTransition();
    if (ready && changed && !reduced.matches && document.startViewTransition) {
      transition = document.startViewTransition(paint);
      transition.finished.catch(() => {});
    } else paint();
  }
  window.campusAppearance = {
    set(value) {
      preference = valid(value) ? value : 'system';
      try {
        localStorage.setItem(key, JSON.stringify({ appearance: preference }));
      } catch {
        /* Optional first-paint cache. */
      }
      apply();
    },
  };
  system.addEventListener('change', apply);
  reduced.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key !== key) return;
    try {
      const saved = JSON.parse(event.newValue);
      preference = valid(saved?.appearance) ? saved.appearance : 'system';
      apply();
    } catch {
      /* Ignore malformed foreign-tab writes. */
    }
  });
  apply();
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      apply();
      ready = true;
    },
    { once: true },
  );
})();
