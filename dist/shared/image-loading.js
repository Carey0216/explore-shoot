import { installFeedLayout } from './feed-layout.js';
let installed = false;
export function originalImageURL(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '';
  const [path, query = ''] = value.split('?');
  if (!/^\/(?:media\/|shared\/|api\/(?:works|shooting-spots)\/)/.test(path)) return '';
  const params = new URLSearchParams(query);
  if (params.get('size') !== 'thumb') return '';
  params.delete('size');
  return path + (params.size ? '?' + params.toString() : '');
}
export function installImageRecovery() {
  if (installed) return;
  installed = true;
  installFeedLayout();
  document.addEventListener(
    'error',
    (e) => {
      const image = e.target;
      if (image.tagName !== 'IMG') return;
      const full = originalImageURL(image.getAttribute('src'));
      if (full && !image.dataset.originalTried) {
        image.dataset.originalTried = 'true';
        image.loading = 'eager';
        image.src = full;
        return;
      }
      if (!image.closest('#main') || image.dataset.imageFailed) return;
      image.dataset.imageFailed = 'true';
      const host = image.closest('button, a') || image.parentElement;
      host.classList.add('image-unavailable');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'image-retry';
      retry.dataset.noLiquid = '';
      retry.textContent = '图片未加载 · 点击重试';
      retry.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        delete image.dataset.imageFailed;
        host.classList.remove('image-unavailable');
        retry.remove();
        const src = image.getAttribute('src');
        image.removeAttribute('src');
        image.loading = 'eager';
        image.src = src;
      };
      // A retry button must never be nested inside another interactive element.
      host.insertAdjacentElement('afterend', retry);
    },
    true,
  );
  document.addEventListener(
    'load',
    (e) => {
      const image = e.target;
      if (image.tagName !== 'IMG' || !image.dataset.imageFailed) return;
      delete image.dataset.imageFailed;
      const host = image.closest('button, a') || image.parentElement;
      host.classList.remove('image-unavailable');
      if (host.nextElementSibling?.classList.contains('image-retry'))
        host.nextElementSibling.remove();
    },
    true,
  );
}
