// Layout follows available space and primary input; UA is only a fallback for foldable phones.
(() => {
  const touch = () =>
    matchMedia('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  let preview = false;
  try {
    preview = sessionStorage.getItem('campus-mobile-preview') === 'true';
  } catch {}
  const update = () => {
    // A portrait soft keyboard can shorten the viewport without rotating the phone.
    const portraitScreen = screen.orientation?.type?.startsWith('portrait');
    const landscape = touch() && innerWidth > innerHeight && !portraitScreen;
    const desktop = !touch() && innerWidth >= 760 && !preview;
    document.documentElement.classList.toggle('mobile-preview', !touch() && preview);
    const blocked = landscape || desktop;
    document.documentElement.classList.toggle('viewport-blocked', blocked);
    let gate = document.getElementById('viewport-gate');
    if (!gate && blocked) {
      gate = document.createElement('dialog');
      gate.id = 'viewport-gate';
      gate.setAttribute('role', 'dialog');
      gate.setAttribute('aria-modal', 'true');
      gate.addEventListener('cancel', (e) => e.preventDefault());
      document.body.append(gate);
    }
    for (const el of [...document.body.children]) {
      if (el === gate || el.tagName === 'SCRIPT') continue;
      if (blocked && !el.hasAttribute('inert')) {
        el.inert = true;
        el.dataset.viewportInert = 'true';
      }
      if (!blocked && el.dataset.viewportInert) {
        el.inert = false;
        delete el.dataset.viewportInert;
      }
    }
    if (gate) {
      gate.hidden = !blocked;
      if (blocked && !gate.open) gate.showModal();
      if (!blocked && gate.open) gate.close();
      if (blocked) {
        gate.innerHTML = `<div class="viewport-illustration ${landscape ? 'rotate-device' : ''}" aria-hidden="true"><i></i><b>↻</b></div><h1>${landscape ? '旋转手机到竖屏以获得更好体验' : '请切换至移动端预览'}</h1><p>${landscape ? '展开或折叠设备后，我们会自动适配可用空间。' : '把校园装进口袋，换一种方式发现。'}</p>${landscape ? '' : '<button type="button" class="button" id="mobile-preview-continue">继续在本机以移动端页面查看</button>'}`;
        gate.querySelector('button')?.addEventListener('click', () => {
          preview = true;
          try {
            sessionStorage.setItem('campus-mobile-preview', 'true');
          } catch {}
          update();
        });
      }
    }
    if (blocked) document.querySelectorAll('video').forEach((v) => v.pause());
    window.dispatchEvent(new CustomEvent('viewport:mode', { detail: { blocked } }));
  };
  if (!document.body) document.addEventListener('DOMContentLoaded', update);
  else update();
  window.addEventListener('resize', update);
  screen.orientation?.addEventListener('change', update);
})();
