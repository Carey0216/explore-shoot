// Resolve the visible language before the module graph; URL overrides never write preferences.
(() => {
  let preference = 'system';
  try {
    preference =
      JSON.parse(localStorage.getItem('explore-guest-preferences-v1') || '{}').language || 'system';
  } catch {}
  const forced = location.pathname.match(/^\/(?:admin\/)?(zh-CN|en-US)(?:\/|$)/)?.[1];
  const device = /^en(?:[-_]|$)/i.test(navigator.languages?.[0] || navigator.language || '')
    ? 'en-US'
    : 'zh-CN';
  const language =
    forced || (preference === 'en-US' ? 'en-US' : preference === 'zh-CN' ? 'zh-CN' : device);
  document.documentElement.lang = language;
  document.title =
    language === 'en-US' ? 'JINGYU · Explore. Capture. Connect.' : '景遇 · 在校园，遇见更多美好';
})();
