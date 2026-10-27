const listeners = new Set();
const defaults = {
  language: 'system',
  campusTime: 'auto',
  appearance: 'system',
  textSize: 'standard',

  mapFollow: true,
  voiceId: 'he',
  assistantAvatar: 'orbit',
};
let scope = 'user:guest',
  current = defaults,
  system = 'light',
  installed = false;
let preferenceEpoch = 0;
const refreshing = new Map();
const palettes = {
  light: {
    bg: '#f5f8fa',
    surface: '#ffffff',
    raised: '#f0f5f9',
    text: '#273d50',
    muted: '#637887',
    line: '#d5e0e7',
    accent: '#346b9c',
    onAccent: '#ffffff',
    selected: '#dcecff',
    danger: '#b33f57',
    dock: '#edf5fcf5',
  },
  dark: {
    bg: '#101b24',
    surface: '#182733',
    raised: '#223744',
    text: '#e6e6e9',
    muted: '#aaaab0',
    line: '#365061',
    accent: '#9ccaff',
    onAccent: '#172a3c',
    selected: '#3b4149',
    danger: '#ff91a7',
    dock: '#222225eb',
  },
};
function normalize(value) {
  const p = { ...defaults };
  for (const [k, choices] of Object.entries({
    language: ['system', 'zh-CN', 'en-US'],
    campusTime: ['auto', 'day', 'evening'],
    appearance: ['system', 'light', 'dark'],
    textSize: ['standard', 'large'],

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
    preferenceScope: scope,
    themeDark: t === 'dark',
    themeClass: 'theme-' + t,
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
  };
}
function publish() {
  const d = snapshot();
  wx.setNavigationBarColor?.({
    frontColor: resolved() === 'dark' ? '#ffffff' : '#000000',
    backgroundColor: palettes[resolved()].bg,
    animation: { duration: 180, timingFunc: 'easeInOut' },
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
  const latest = require(administrator ? './admin-api' : './api').session?.()?.account;
  if (
    latest?.id === value?.id &&
    Number(latest?.preferencesRevision || 0) > Number(value?.preferencesRevision || 0)
  )
    value = latest;
  const next =
    require('./network').configuredOrigin() +
    ':' +
    (administrator ? 'admin:' : 'user:') +
    (value?.id || 'guest');
  if (next !== scope || value?.preferences) {
    if (next !== scope) preferenceEpoch++;
    scope = next;
    current = normalize(value?.preferences || wx.getStorageSync('campus-mini-appearance:' + scope));
    publish();
  }
}
async function update(patch, administrator = false) {
  preferenceEpoch++;
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
    if (s)
      client.updateAccount?.({
        ...s.account,
        preferences: current,
        preferencesRevision: r.revision ?? s.account.preferencesRevision,
      });
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
function refresh(administrator = false) {
  const client = require(administrator ? './admin-api' : './api');
  const before = client.session();
  if (!before) return Promise.resolve(snapshot());
  const origin = require('./network').configuredOrigin(),
    owner = before.account.id,
    token = before.token;
  const selected = origin + ':' + (administrator ? 'admin:' : 'user:') + owner;
  if (refreshing.has(selected)) return refreshing.get(selected);
  const stamp = preferenceEpoch;
  const job = client
    .request(administrator ? '/auth/me' : '/api/auth/me')
    .then((result) => {
      const now = client.session();
      if (
        stamp !== preferenceEpoch ||
        !now ||
        now.account.id !== owner ||
        now.token !== token ||
        result.account?.id !== owner ||
        require('./network').configuredOrigin() !== origin
      )
        return snapshot();
      client.updateAccount?.(result.account);
      account(result.account, administrator);
      return snapshot();
    })
    .catch(() => snapshot())
    .finally(() => refreshing.delete(selected));
  refreshing.set(selected, job);
  return job;
}
function subscribe(fn) {
  install();
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}
module.exports = { install, account, update, refresh, snapshot, subscribe, normalize, defaults };
