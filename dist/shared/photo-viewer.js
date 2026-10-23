// Keep media in the current page. No new tab, media URL navigation or history entry.
export function installPhotoViewer() {
  let active;
  const close = () => active?.close();
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link?.querySelector('img') || event.defaultPrevented || event.button !== 0) return;
    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }
    if (
      url.origin !== location.origin ||
      !(
        /^\/media\/[a-f0-9-]+$/.test(url.pathname) ||
        /^\/shared\/.+\.(png|jpe?g|webp)$/i.test(url.pathname)
      )
    )
      return;
    event.preventDefault();
    close();
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'photo-viewer73';
    dialog.setAttribute('aria-label', '照片预览');
    const image = document.createElement('img');
    image.alt = link.querySelector('img').alt || '照片大图';
    image.src = url.href;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo-viewer-close73';
    button.textContent = '关闭';
    button.setAttribute('aria-label', '关闭照片预览');
    button.onclick = () => dialog.close();
    dialog.append(button, image);
    document.body.append(dialog);
    active = dialog;
    document.documentElement.classList.add('photo-viewing73');
    dialog.addEventListener(
      'close',
      () => {
        image.removeAttribute('src');
        dialog.remove();
        if (active === dialog) {
          active = null;
          document.documentElement.classList.remove('photo-viewing73');
        }
        if (previous?.isConnected) previous.focus({ preventScroll: true });
      },
      { once: true },
    );
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.showModal();
    button.focus();
  });
  window.addEventListener('hashchange', close);
  window.addEventListener('pagehide', close);
}
