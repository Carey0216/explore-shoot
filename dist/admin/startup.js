(() => {
  const screen = document.getElementById('admin-startup'),
    status = document.getElementById('admin-startup-status'),
    retry = document.getElementById('admin-startup-retry');
  let done = false;
  const slow = setTimeout(() => {
    if (!done) status.textContent = '连接较慢，正在准备工作台…';
  }, 4500);
  const timeout = setTimeout(() => fail('暂时无法连接工作台，请检查网络后重试。'), 15000);
  function fail(message) {
    if (done) return;
    clearTimeout(slow);
    clearTimeout(timeout);
    screen.classList.add('startup-error');
    status.textContent = message;
    retry.hidden = false;
  }
  retry.onclick = () => location.reload();
  window.adminStartup = {
    fail,
    ready() {
      if (done) return;
      done = true;
      clearTimeout(slow);
      clearTimeout(timeout);
      document.body.classList.remove('app-starting');
      screen.inert = true;
      screen.setAttribute('aria-hidden', 'true');
      screen.classList.add('startup-leaving');
      setTimeout(() => screen.remove(), 240);
    },
  };
})();
