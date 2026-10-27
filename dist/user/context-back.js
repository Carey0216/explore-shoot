const listPositions = new Map();
export function clearListState() {
  listPositions.clear();
}
let currentRoute = location.hash || '#discover';
let lastScrollY = 0;
export function rememberList(state) {
  listPositions.set(currentRoute, {
    y: lastScrollY,
    theme: state.theme,
    query: state.query,
    localQuery: state.localQuery,
    myTab: state.myTab,
    myQuery: state.myQuery,
    camera: state.mapCamera,
  });
  if (listPositions.size > 40) listPositions.delete(listPositions.keys().next().value);
}
export function restoreState(state) {
  currentRoute = location.hash || '#discover';
  const saved = listPositions.get(currentRoute);
  if (saved)
    for (const key of ['theme', 'query', 'localQuery', 'myTab', 'myQuery']) state[key] = saved[key];
  if (saved?.camera) state.mapCamera = { ...saved.camera };
}
let renderedRoute;
export function restoreList(route) {
  if (route === '#settings?section=account') {
    renderedRoute = route;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById('account-settings-heading')
          ?.closest('.settings-card')
          ?.scrollIntoView({ block: 'start' }),
      ),
    );
    return;
  }
  if (renderedRoute === route) return;
  renderedRoute = route;
  const saved = listPositions.get(route || '#discover');
  const y = saved?.y || 0;
  let moved = false;
  const cancel = () => {
    moved = true;
  };
  document.addEventListener('pointerdown', cancel, { once: true, capture: true });
  for (const event of ['wheel', 'touchstart', 'keydown'])
    document.addEventListener(event, cancel, { once: true, capture: true, passive: true });
  const place = () => {
    if (!moved && (location.hash || '#discover') === (route || '#discover')) window.scrollTo(0, y);
  };
  requestAnimationFrame(() => requestAnimationFrame(place));
  const host = document.getElementById('main');
  const loaded = () => place();
  host?.addEventListener?.('load', loaded, true);
  setTimeout(() => {
    host?.removeEventListener?.('load', loaded, true);
    document.removeEventListener?.('pointerdown', cancel, true);
    for (const event of ['wheel', 'touchstart', 'keydown'])
      document.removeEventListener?.(event, cancel, true);
  }, 1800);
}
// Only remember in-app hash routes. Root tabs have no artificial "back to community".
export function backDestination(routes, fallback) {
  return routes.length > 1 ? routes[routes.length - 2] : fallback;
}
export function installContextBack() {
  if (window.history && 'scrollRestoration' in window.history)
    window.history.scrollRestoration = 'manual';
  lastScrollY = window.scrollY;
  const captureScroll = () => {
    if ((location.hash || '#discover') === currentRoute) lastScrollY = window.scrollY;
  };
  window.addEventListener('scroll', captureScroll, { passive: true });
  document.addEventListener('pointerdown', captureScroll, true);
  const routes = [location.hash || '#discover'];
  window.addEventListener('hashchange', () => {
    const next = location.hash || '#discover';
    if (routes.at(-2) === next) routes.pop();
    else if (routes.at(-1) !== next) routes.push(next);
    if (routes.length > 60) routes.shift();
  });
  const decorate = () =>
    document.querySelectorAll('#main a').forEach((a) => {
      if (a.dataset.contextBack !== undefined || !a.textContent.trim().startsWith('←')) return;
      a.dataset.contextBack = '';
      a.classList.add('page-back');
      a.classList.remove('text-btn');
      a.setAttribute('aria-label', '返回上一页');
      a.textContent = '‹ 返回';
    });
  new MutationObserver(decorate).observe(document.getElementById('main'), {
    childList: true,
    subtree: true,
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('[data-context-back]');
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    location.hash = backDestination(routes, a.getAttribute('href'));
  });
}
