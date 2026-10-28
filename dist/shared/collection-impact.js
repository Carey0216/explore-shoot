// Move visible controls, never the long scrolling page or a map/camera containing block.
export function collectionImpact(dialog) {
  const root = document.documentElement;
  const ground = root.style.getPropertyValue('--collection-ground815');
  root.style.setProperty('--collection-ground815', getComputedStyle(document.body).backgroundColor);
  root.classList.add('collection-scene815');
  let timer;
  const marked = [];
  const visible = (element) => {
    const r = element.getBoundingClientRect();
    const height = window.visualViewport?.height || window.innerHeight;
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.top < height &&
      r.right > 0 &&
      r.left < window.innerWidth
    );
  };
  const clear = () => {
    clearTimeout(timer);
    document.body.classList.remove(
      'collection-impact813',
      'collection-impact814',
      'collection-impact815',
    );
    for (const element of marked) {
      element.classList.remove('collection-world815', 'collection-control815');
      element.style.removeProperty('--collection-delay815');
    }
    marked.length = 0;
  };
  const mark = (element, kind) => {
    if (!element || marked.length >= 36 || !visible(element) || marked.includes(element)) return;
    element.classList.add(kind);
    element.style.setProperty('--collection-delay815', (marked.length % 3) * 25 + 'ms');
    marked.push(element);
  };
  return {
    clear,
    play() {
      clear();
      for (const element of document.querySelectorAll('#topbar, #mobile-nav, .desktop-sidebar'))
        mark(element, 'collection-world815');
      mark(dialog.querySelector('.dialog-head'), 'collection-world815');
      for (const element of document.querySelectorAll(
        '#main .page-heading, #main .card-title, #main .identity-copy73',
      ))
        mark(element, 'collection-world815');
      for (const element of document.querySelectorAll(
        '#main button, #mobile-nav a, #mobile-nav .dock-create',
      )) {
        if (marked.length >= 36) break;
        mark(element, 'collection-control815');
      }
      mark(dialog.querySelector('.dialog-head button'), 'collection-control815');
      document.body.classList.add('collection-impact815');
      timer = setTimeout(clear, 1200);
    },
    dispose() {
      clear();
      root.classList.remove('collection-scene815');
      if (ground) root.style.setProperty('--collection-ground815', ground);
      else root.style.removeProperty('--collection-ground815');
    },
  };
}
