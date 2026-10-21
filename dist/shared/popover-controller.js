// One explicit toggle state avoids native light-dismiss racing the trigger click.
export function controlPopover(button, panel, { position = () => {}, onChange = () => {} } = {}) {
  const native = typeof panel.showPopover === 'function';
  panel.setAttribute('popover', 'manual');
  panel.classList.add('controlled-popover');
  if (!native) {
    panel.removeAttribute('popover');
    panel.hidden = true;
  }
  let desired = false,
    animation,
    revision = 0,
    disposed = false;
  const visible = () => (native ? panel.matches(':popover-open') : !panel.hidden);
  function set(open) {
    if (disposed || desired === open) return;
    desired = open;
    const stamp = ++revision;
    animation?.cancel();
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      position();
      if (!visible()) native ? panel.showPopover() : (panel.hidden = false);
    }
    onChange(open);
    const reduce =
      document.documentElement.dataset.motion === 'reduce' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      if (!disposed && stamp === revision && !desired && visible())
        native ? panel.hidePopover() : (panel.hidden = true);
    };
    if (reduce || !panel.animate) {
      finish();
      return;
    }
    animation = panel.animate(
      open
        ? [
            { opacity: 0, transform: 'translateY(8px) scale(.98)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ]
        : [
            { opacity: 1, transform: 'translateY(0) scale(1)' },
            { opacity: 0, transform: 'translateY(5px) scale(.98)' },
          ],
      { duration: open ? 180 : 130, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    animation.finished.then(finish, () => {});
  }
  const outside = (e) => {
    if (desired && !panel.contains(e.target) && !button.contains(e.target)) set(false);
  };
  const keys = (e) => {
    if (desired && e.key === 'Escape') {
      set(false);
      button.focus({ preventScroll: true });
    }
  };
  button.onclick = () => set(!desired);
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', keys);
  return {
    open: () => set(true),
    close: () => set(false),
    isOpen: () => desired,
    destroy() {
      disposed = true;
      revision++;
      animation?.cancel();
      if (visible()) native ? panel.hidePopover() : (panel.hidden = true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keys);
      button.onclick = null;
    },
  };
}
