// Runs before the application's module graph: even a failed module download has a retry UI.
(() => {
  const screen = document.getElementById('startup'),
    status = document.getElementById('startup-status'),
    retry = document.getElementById('startup-retry');
  let done = false,
    language = 'zh-CN',
    currentStatus = '准备好，一起出发。';
  // Tiny bootstrap copy works even when the main translation module cannot download.
  const copy = {
    探索与拍摄: ['探索與拍攝', '探検と撮影', 'Explore & Shoot'],
    正在准备校园: ['正在準備校園', 'キャンパスを準備中', 'Preparing your campus'],
    '下一处风景，就在身边。': [
      '下一處風景，就在身邊。',
      '次の景色は、すぐそばに。',
      'Your next discovery is close by.',
    ],
    '准备好，一起出发。': [
      '準備好，一起出發。',
      '準備ができたら、一緒に出発。',
      'Getting ready to explore together.',
    ],
    '网络有点慢，风景马上就来。': [
      '網路有點慢，風景馬上就來。',
      '通信が少し遅れています。もう少しお待ちください。',
      'The connection is a little slow. Hang tight.',
    ],
    '暂时没能打开校园，请检查网络后重试。': [
      '暫時沒能打開校園，請檢查網路後重試。',
      'キャンパスを開けませんでした。通信を確認して再試行してください。',
      'Unable to open the campus. Check your connection and try again.',
    ],
    重新打开: ['重新打開', 'もう一度開く', 'Open again'],
  };
  const translate = (text) => copy[text]?.[['zh-TW', 'ja', 'en'].indexOf(language)] || text;
  function configure(pref) {
    language = ['zh-CN', 'zh-TW', 'ja', 'en'].includes(pref?.language) ? pref.language : 'zh-CN';
    if (pref?.motion === 'reduce') document.documentElement.dataset.motion = 'reduce';
    else document.documentElement.dataset.motion = 'system';
    screen.querySelector('h1').textContent = translate('探索与拍摄');
    screen.querySelector('.startup-tagline').textContent = translate('下一处风景，就在身边。');
    screen.setAttribute('aria-label', translate('正在准备校园'));
    status.textContent = translate(currentStatus);
    retry.textContent = translate('重新打开');
  }
  function message(text) {
    currentStatus = text;
    status.textContent = translate(text);
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
