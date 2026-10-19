// The layout viewport remains stable while the visual viewport shrinks with a keyboard.
(() => {
  const update = () => {
    const visual = window.visualViewport;
    document.documentElement.style.setProperty(
      '--visual-height',
      (visual?.height || innerHeight) + 'px',
    );
    const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    document.documentElement.classList.toggle(
      'keyboard-open',
      editing && !!visual && innerHeight - visual.height > 140,
    );
  };
  window.visualViewport?.addEventListener('resize', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
})();
