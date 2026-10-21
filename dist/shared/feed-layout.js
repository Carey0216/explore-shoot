// Explicit columns avoid native multicol fragmentation of replaced images in WebKit.
// Paging still controls the amount of data loaded; cards retain their natural image ratio.
export function stabilizeFeeds(root = document) {
  root.querySelectorAll('.feed-grid').forEach((feed) => {
    const cards = [...feed.children].filter((e) => e.matches('.point-card'));
    if (!cards.length) return;
    let columns = [...feed.children].filter((e) => e.classList.contains('feed-column'));
    if (columns.length !== 2) {
      columns = Array.from({ length: 2 }, () => {
        const column = document.createElement('div');
        column.className = 'feed-column';
        feed.append(column);
        return column;
      });
    }
    const offset = columns.reduce((n, c) => n + c.children.length, 0);
    cards.forEach((card, i) => {
      card.querySelectorAll('.photo-wrap img').forEach((image) => {
        image.loading = 'eager';
        image.decoding = 'auto';
      });
      columns[(offset + i) % 2].append(card);
    });
    feed.dataset.imageLayout = 'stable';
  });
}
export function installFeedLayout() {
  if (typeof MutationObserver === 'undefined') return;
  let queued = false;
  const update = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      stabilizeFeeds();
    });
  };
  new MutationObserver(update).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  update();
}
