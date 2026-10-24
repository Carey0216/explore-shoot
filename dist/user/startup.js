// Runs before the application's module graph: even a failed module download has a retry UI.
(() => {
  const screen = document.getElementById('startup'),
    status = document.getElementById('startup-status'),
    retry = document.getElementById('startup-retry');
  if (!screen || !status || !retry) return;
  let done = false,
    currentStatus = '准备好，一起出发。';
  function configure(pref) {
    if (pref?.motion === 'reduce') document.documentElement.dataset.motion = 'reduce';
    else document.documentElement.dataset.motion = 'system';
    screen.querySelector('h1').setAttribute('aria-label', '景遇校园');
    screen.querySelector('.startup-tagline').textContent = '下一处风景，就在身边。';
    screen.setAttribute('aria-label', '正在准备校园');
    status.textContent = currentStatus;
    retry.textContent = '重新打开';
  }
  function message(text) {
    currentStatus = text;
    status.textContent = text;
  }
  try {
    configure(JSON.parse(localStorage.getItem('explore-guest-preferences-v1')));
  } catch {
    configure(null);
  }
  const slow = setTimeout(() => {
    if (!done) message('网络有点慢，风景马上就来。');
  }, 4500);
  const timeout = setTimeout(() => fail('暂时没能打开校园，请检查网络后重试。'), 15000);
  function fail(text) {
    if (done) return;
    clearTimeout(slow);
    clearTimeout(timeout);
    screen.classList.add('startup-error');
    message(text);
    retry.hidden = false;
  }
  retry.addEventListener('click', () => location.reload());
  window.campusStartup = {
    fail,
    configure,
    ready() {
      if (done) return;
      done = true;
      clearTimeout(slow);
      clearTimeout(timeout);
      document.body.classList.remove('app-starting');
      screen.classList.add('startup-leaving');
      screen.setAttribute('aria-hidden', 'true');
      screen.inert = true;
      setTimeout(() => screen.remove(), 260);
    },
  };
})();
