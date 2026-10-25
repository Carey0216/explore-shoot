import { openPhotoViewer } from '/shared/photo-viewer.js';
import { $, esc, icon } from '/shared/ui.js';
export function placePhotos(point, cover) {
  const gallery = (point.gallery || []).filter((u) => /^\/media\/[a-f0-9-]{36}$/.test(u));
  return [...new Set([cover, ...gallery].filter(Boolean))].slice(0, 9);
}
export function placeHero(point, cover, credit) {
  const images = placePhotos(point, cover);
  return `<figure class="place-hero"><a href="${esc(images[0])}" class="place-hero-link" aria-label="查看地点照片大图"><img class="place-hero-main" src="${esc(images[0])}" alt="${esc(point.name)}${point.cover ? '校园发现照片' : '校园参考配图'}"></a><div class="place-hero-top"><a data-no-liquid class="hero-back" data-context-back href="#discover" aria-label="返回上一页">${icon('arrow')}</a><button data-no-liquid class="hero-share" type="button" data-share-point aria-label="分享这个地点">${icon('share')}</button></div>${images.length > 1 ? `<div class="place-photo-strip" aria-label="地点照片">${images.map((url, i) => `<button data-no-liquid data-place-photo="${i}" aria-label="查看第${i + 1}张照片" aria-pressed="${i === 0}"><img src="${esc(url)}?size=thumb" alt="地点照片${i + 1}" loading="lazy"></button>`).join('')}</div>` : ''}<figcaption>${esc(credit)}${images.length > 1 ? ` · <b data-place-photo-count>1 / ${images.length}</b>` : ''}</figcaption></figure>`;
}
export function bindPlaceHero(root, point, cover) {
  const images = placePhotos(point, cover);
  const heroLink = $('.place-hero-link', root);
  if (heroLink)
    heroLink.onclick = (e) => {
      e.preventDefault();
      const path = new URL(heroLink.href, location.href).pathname;
      openPhotoViewer(images, Math.max(0, images.indexOf(path)));
    };
  root.querySelectorAll('[data-place-photo]').forEach(
    (button) =>
      (button.onclick = () => {
        const index = Number(button.dataset.placePhoto),
          image = $('.place-hero-main', root),
          link = $('.place-hero-link', root);
        image.src = images[index];
        link.href = images[index];
        root
          .querySelectorAll('[data-place-photo]')
          .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        $('[data-place-photo-count]', root).textContent = index + 1 + ' / ' + images.length;
      }),
  );
}
