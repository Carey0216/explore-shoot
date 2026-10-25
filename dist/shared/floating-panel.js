import { esc } from './ui.js';

let dismissCurrent;
// A light-dismiss surface beside its trigger, without a page-sized dimming layer.
export function floatingPanel({
  title,
  body,
  anchor = document.activeElement,
  className = '',
  mount,
}) {
  dismissCurrent?.();
  const panel = document.createElement('section');
  const heading = 'floating-' + crypto.randomUUID();
  panel.className = 'compact-popover ' + className;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', heading);
  panel.innerHTML = `<h2 id="${heading}">${esc(title)}</h2>${body}`;
  const native = typeof panel.showPopover === 'function';
  if (native) panel.setAttribute('popover', 'manual');
  document.body.append(panel);
  if (native) panel.showPopover();
  let disposed = false,
    cleanup;
  function position() {
    if (disposed) return;
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0,
      topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth,
      height = viewport?.height || innerHeight;
    const frame = document.querySelector?.('.app-shell')?.getBoundingClientRect();
    const safeLeft = Math.max(leftEdge, frame?.left || 0);
    const safeRight = Math.min(leftEdge + width, frame?.right || leftEdge + width);
    panel.style.maxWidth = `${Math.max(160, safeRight - safeLeft - 24)}px`;
    panel.style.maxHeight = `${Math.max(120, height - 24)}px`;
    const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const usable = rect && rect.width && rect.height;
    const left = Math.max(
      safeLeft + 12,
      Math.min(
        usable ? rect.left : leftEdge + (width - panel.offsetWidth) / 2,
        safeRight - panel.offsetWidth - 12,
      ),
    );
    const below = usable && rect.bottom + panel.offsetHeight + 10 < topEdge + height - 12;
    const top = Math.max(
      topEdge + 12,
      Math.min(
        usable
          ? below
            ? rect.bottom + 8
            : rect.top - panel.offsetHeight - 8
          : topEdge + (height - panel.offsetHeight) / 2,
        topEdge + height - panel.offsetHeight - 12,
      ),
    );
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  function close(restoreFocus = false) {
    if (disposed) return;
    disposed = true;
    cleanup?.();
    observer?.disconnect();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keydown, true);
    window.removeEventListener('hashchange', route);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    window.visualViewport?.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('scroll', position);
    anchor?.removeAttribute?.('aria-expanded');
    panel.remove();
    if (dismissCurrent === route) dismissCurrent = null;
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }
  const route = () => close();
  const outside = (event) => {
    if (!panel.contains(event.target)) close();
  };
  const keydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(position) : null;
  observer?.observe(panel);
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', keydown, true);
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  anchor?.setAttribute?.('aria-expanded', 'true');
  dismissCurrent = route;
  position();
  cleanup = mount?.(panel, close);
  panel.querySelector('input,select,textarea,button,a')?.focus({ preventScroll: true });
  return { panel, close, position };
}
