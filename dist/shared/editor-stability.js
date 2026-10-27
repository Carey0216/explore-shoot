// A text drag may scroll its textarea, but must not drag a containing editor off-screen.
export function stabilizeEditor(root) {
  let restore = null;
  const stop = () => {
    restore?.();
    restore = null;
  };
  const down = (e) => {
    stop();
    if (
      e.pointerType === 'touch' ||
      e.button !== 0 ||
      !e.target.matches?.('textarea,input[type=text],input:not([type])')
    )
      return;
    const locked = [];
    for (let p = e.target.parentElement; p && p !== document.body; p = p.parentElement)
      if (p.scrollHeight > p.clientHeight + 1)
        locked.push({ element: p, top: p.scrollTop, left: p.scrollLeft });
    const page = document.scrollingElement;
    if (page) locked.push({ element: page, top: page.scrollTop, left: page.scrollLeft });
    const hold = (e) => {
      const r = locked.find(
        (x) => x.element === (e.target === document ? document.scrollingElement : e.target),
      );
      if (r) {
        if (r.element.scrollTop !== r.top) r.element.scrollTop = r.top;
        if (r.element.scrollLeft !== r.left) r.element.scrollLeft = r.left;
      }
    };
    root.addEventListener('scroll', hold, true);
    document.addEventListener('scroll', hold, true);
    restore = () => {
      root.removeEventListener('scroll', hold, true);
      document.removeEventListener('scroll', hold, true);
    };
  };
  root.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', stop, true);
  window.addEventListener('pointercancel', stop, true);
  window.addEventListener('blur', stop);
  return () => {
    stop();
    root.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', stop, true);
    window.removeEventListener('pointercancel', stop, true);
    window.removeEventListener('blur', stop);
  };
}
