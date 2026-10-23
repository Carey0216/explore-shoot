const listeners = new Set();
const defaults = {
  campusTime: 'auto',
  appearance: 'system',
  textSize: 'standard',
  motion: 'system',
  mapFollow: true,
  voiceId: 'he',
  assistantAvatar: 'orbit',
};
let scope = 'user:guest',
  current = defaults,
  system = 'light',
  installed = false;
const palettes = {
  light: {
    bg: '#f5f7f5',
    surface: '#ffffff',
    raised: '#f0f5f9',
    text: '#273d50',
    muted: '#637887',
    line: '#d5e0e7',
    accent: '#346b9c',
    selected: '#dcecff',
    danger: '#b33f57',
    dock: '#edf5fcf5',
  },
  dark: {
    bg: '#000000',
    surface: '#1c1c1e',
    raised: '#2c2c2e',
    text: '#e6e6e9',
    muted: '#aaaab0',
    line: '#38383c',
    accent: '#9ccaff',
    selected: '#3b4149',
    danger: '#ff91a7',
    dock: '#222225eb',
  },
};
function normalize(value) {
  const p = { ...defaults };
  for (const [k, choices] of Object.entries({
    campusTime: ['auto', 'day', 'evening'],
    appearance: ['system', 'light', 'dark'],
    textSize: ['standard', 'large'],
    motion: ['system', 'reduce'],
    assistantAvatar: ['orbit', 'cube', 'sprout', 'fox', 'cloud'],
    voiceId: ['he', 'qing', 'lu', 'zhou', 'chuan', 'yu'],
  }))
    if (choices.includes(value?.[k])) p[k] = value[k];
  if (typeof value?.mapFollow === 'boolean') p.mapFollow = value.mapFollow;
  return p;
}
function resolved() {
  return current.appearance === 'system' ? system : current.appearance;
}
function snapshot() {
  const t = resolved();
  return {
    themeDark: t === 'dark',
    themeClass: 'theme-' + t + (current.motion === 'reduce' ? ' reduce-motion' : ''),
    themeStyle:
      Object.entries(palettes[t])
        .map(([k, v]) => '--' + k + ':' + v)
        .join(';') +
      ';--font-scale:' +
      (current.textSize === 'large' ? '1.14' : '1') +
      ';font-size:' +
      (current.textSize === 'large' ? '32rpx' : '28rpx'),
    pageStyle: 'background:' + palettes[t].bg + ';color:' + palettes[t].text + ';',
    appearance: current.appearance,
    preferences: { ...current },
    reducedMotion: current.motion === 'reduce',
  };
}
function publish() {
  const d = snapshot();
  wx.setNavigationBarColor?.({
    frontColor: resolved() === 'dark' ? '#ffffff' : '#000000',
    backgroundColor: palettes[resolved()].bg,
    animation: { duration: current.motion === 'reduce' ? 0 : 180, timingFunc: 'easeInOut' },
  });
  wx.setBackgroundColor?.({ backgroundColor: palettes[resolved()].bg });
  for (const fn of listeners) fn(d);
}
function install() {
  if (installed) return;
  installed = true;
  system =
    (wx.getAppBaseInfo?.() || wx.getSystemInfoSync?.() || {}).theme === 'dark' ? 'dark' : 'light';
  wx.onThemeChange?.((e) => {
    system = e.theme === 'dark' ? 'dark' : 'light';
    publish();
  });
  scope = require('./network').configuredOrigin() + ':user:guest';
  current = normalize(wx.getStorageSync('campus-mini-appearance:' + scope));
}
function account(value, administrator = false) {
  install();
  const next =
    require('./network').configuredOrigin() +
    ':' +
    (administrator ? 'admin:' : 'user:') +
    (value?.id || 'guest');
  if (next !== scope || value?.preferences) {
    scope = next;
    current = normalize(value?.preferences || wx.getStorageSync('campus-mini-appearance:' + scope));
    publish();
  }
}
async function update(patch, administrator = false) {
  const before = current,
    selected = scope;
  current = normalize({ ...current, ...patch });
  wx.setStorageSync('campus-mini-appearance:' + scope, current);
  publish();
  const client = require(administrator ? './admin-api' : './api');
  if (!client.session()) return snapshot();
  try {
    const r = await client.request(
      administrator ? '/auth/preferences' : '/api/auth/preferences',
      'PATCH',
      patch,
    );
    if (scope !== selected) return snapshot();
    current = normalize(r.preferences);
    const s = client.session();
    if (s) client.updateAccount?.({ ...s.account, preferences: current });
    publish();
    return snapshot();
  } catch (e) {
    if (scope === selected) {
      current = before;
      wx.setStorageSync('campus-mini-appearance:' + scope, current);
      publish();
    }
    throw e;
  }
}
function subscribe(fn) {
  install();
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}
module.exports = { install, account, update, snapshot, subscribe, normalize, defaults };
