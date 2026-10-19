// Only remember in-app hash routes. Root tabs have no artificial "back to community".
export function backDestination(routes, fallback) {
  return routes.length > 1 ? routes[routes.length - 2] : fallback;
}
export function installContextBack() {
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
