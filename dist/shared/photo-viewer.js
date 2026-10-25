// A single in-page viewer keeps the original card, scroll position and route intact.
let active;
export function openPhotoViewer(sources, selected = 0) {
  active?.close();
  const urls = [...new Set(sources.filter(Boolean))];
  if (!urls.length) return;
  let index = Math.max(0, Math.min(selected, urls.length - 1)),
    scale = 1,
    x = 0,
    y = 0,
    gesture = null;
  const previous = document.activeElement,
    scroll = { x: scrollX, y: scrollY };
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-viewer73 photo-gesture81';
  dialog.setAttribute('aria-label', '照片预览');
  const stage = document.createElement('div');
  stage.className = 'photo-stage81';
  const image = document.createElement('img');
  image.alt = '照片大图';
  image.draggable = false;
  const count = document.createElement('span');
  count.className = 'photo-count81';
  count.setAttribute('aria-live', 'polite');
  const status = document.createElement('p');
  status.className = 'photo-status81';
  status.setAttribute('role', 'status');
  const button = (label, text, handler) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.textContent = text;
    b.onclick = handler;
    return b;
  };
  const close = button('关闭照片预览', '×', () => dialog.close());
  close.className = 'photo-viewer-close73';
  const prev = button('上一张照片', '‹', () => draw(index - 1)),
    next = button('下一张照片', '›', () => draw(index + 1));
  prev.className = 'photo-prev81';
  next.className = 'photo-next81';
  const paint = () => {
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  };
  function draw(value) {
    index = (value + urls.length) % urls.length;
    scale = 1;
    x = y = 0;
    paint();
    status.textContent = '正在加载照片…';
    image.src = urls[index];
    count.textContent = `${index + 1} / ${urls.length}`;
    prev.hidden = next.hidden = urls.length < 2;
  }
  image.onload = () => {
    status.textContent = '左右切图 · 双指缩放 · 下滑关闭';
  };
  image.onerror = () => {
    status.textContent = '照片未加载，点此重试';
  };
  status.onclick = () => {
    if (!image.complete || !image.naturalWidth) {
      const src = image.src;
      image.removeAttribute('src');
      image.src = src;
    }
  };
  stage.append(image);
  dialog.append(stage, close, count, prev, next, status);
  document.body.append(dialog);
  active = dialog;
  document.documentElement.classList.add('photo-viewing73');
  const pointers = new Map();
  const distance = () => {
    const a = [...pointers.values()];
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  };
  stage.onpointerdown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    gesture =
      pointers.size === 2
        ? { distance: distance(), scale, x, y }
        : { startX: e.clientX, startY: e.clientY, x, y };
  };
  stage.onpointermove = (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && gesture.distance) {
      scale = Math.max(
        1,
        Math.min(4, (gesture.scale * distance()) / Math.max(1, gesture.distance)),
      );
      paint();
    } else if (pointers.size === 1 && gesture.startX !== undefined && scale > 1) {
      x = gesture.x + e.clientX - gesture.startX;
      y = gesture.y + e.clientY - gesture.startY;
      paint();
    }
  };
  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const g = gesture;
    const single = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (single && g?.startX !== undefined && scale === 1) {
      const dx = e.clientX - g.startX,
        dy = e.clientY - g.startY;
      if (dy > 85 && Math.abs(dy) > Math.abs(dx) * 1.4) dialog.close();
      else if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3)
        draw(index + (dx < 0 ? 1 : -1));
    }
    gesture = null;
    if (scale <= 1) {
      x = y = 0;
      paint();
    }
  };
  stage.onpointerup = release;
  stage.onpointercancel = () => {
    pointers.clear();
    gesture = null;
  };
  stage.ondblclick = () => {
    scale = scale === 1 ? 2 : 1;
    x = y = 0;
    paint();
  };
  dialog.onkeydown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      draw(index - 1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      draw(index + 1);
    }
  };
  dialog.addEventListener(
    'close',
    () => {
      image.removeAttribute('src');
      dialog.remove();
      if (active === dialog) {
        active = null;
        document.documentElement.classList.remove('photo-viewing73');
      }
      window.scrollTo(scroll.x, scroll.y);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    },
    { once: true },
  );
  dialog.showModal();
  draw(index);
  close.focus();
  return dialog;
}
export function installPhotoViewer() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link?.querySelector('img') || event.defaultPrevented || event.button !== 0) return;
    const safe = (value) => {
      try {
        const u = new URL(value, location.href);
        return u.origin === location.origin &&
          /^\/(?:media\/[a-f0-9-]+|shared\/.+\.(?:png|jpe?g|webp)|api\/(?:works|shooting-spots)\/[^/]+\/photo)$/.test(
            u.pathname,
          )
          ? u.href
          : '';
      } catch {
        return '';
      }
    };
    const url = safe(link.href);
    if (!url) return;
    event.preventDefault();
    const scope =
      link.closest('.comparison-grid,.memory-gallery81,.work-grid,.photo-gallery') ||
      link.parentElement;
    const urls = [...scope.querySelectorAll('a[href]')]
      .filter((a) => a.querySelector('img'))
      .map((a) => safe(a.href))
      .filter(Boolean);
    if (!urls.includes(url)) urls.push(url);
    openPhotoViewer(urls, urls.indexOf(url));
  });
  window.addEventListener('hashchange', () => active?.close());
  window.addEventListener('pagehide', () => active?.close());
}
