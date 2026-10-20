export const defaults = Object.freeze({
  appearance: 'system',
  textSize: 'standard',
  motion: 'system',
  mapFollow: true,
  voiceId: 'he',
  assistantAvatar: 'orbit',
});
const choices = {
  appearance: ['system', 'light', 'dark'],
  textSize: ['standard', 'large'],
  motion: ['system', 'reduce'],
  assistantAvatar: ['orbit', 'cube', 'sprout', 'fox', 'cloud'],
  voiceId: ['he', 'qing', 'lu', 'zhou', 'chuan', 'yu'],
};
const storageKey = 'explore-guest-preferences-v1',
  listeners = new Set();
let account = null,
  epoch = 0,
  pending = 0,
  revision = 0,
  queue = Promise.resolve();
export function normalizePreferences(value) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key === 'mapFollow') {
      if (typeof value?.[key] === 'boolean') result[key] = value[key];
    } else if (choices[key].includes(value?.[key])) result[key] = value[key];
  }
  return result;
}
function readGuest() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    const result = normalizePreferences(value);
    if (value && Object.hasOwn(value, 'language')) {
      const cleaned = { ...value };
      delete cleaned.language;
      try {
        localStorage.setItem(storageKey, JSON.stringify(cleaned));
      } catch {
        /* Read-only storage still allows browsing. */
      }
    }
    if (!value?.voiceId) {
      const old = localStorage.getItem('explore-navigation-voice');
      if (choices.voiceId.includes(old)) result.voiceId = old;
    }
    return result;
  } catch {
    return { ...defaults };
  }
}
let current = readGuest();
export const getPreferenceAccountId = () => account?.id || null;
export const getPreferences = () => ({ ...current });
export const preferenceScope = () => (account ? 'account' : 'device');
export const subscribePreferences = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function publish() {
  for (const listener of listeners) listener(getPreferences(), preferenceScope());
}
export function setPreferenceAccount(value) {
  if ((account?.id || null) !== (value?.id || null)) {
    epoch++;
    account = value || null;
    revision = Number(value?.preferencesRevision) || 0;
    current = account ? normalizePreferences(value.preferences) : readGuest();
    publish();
    return;
  }
  if (value && !pending && (Number(value.preferencesRevision) || 0) > revision) {
    account = value;
    revision = Number(value.preferencesRevision) || 0;
    current = normalizePreferences(value.preferences);
    publish();
  }
}
export function updatePreferences(patch) {
  const id = account?.id || null,
    stamp = epoch;
  const work = async () => {
    if (stamp !== epoch || id !== (account?.id || null)) throw Error('账号已变化，请重新修改设置');
    if (
      !patch ||
      typeof patch !== 'object' ||
      Array.isArray(patch) ||
      !Object.keys(patch).length ||
      Object.keys(patch).some((k) => !Object.hasOwn(defaults, k)) ||
      Object.entries(patch).some(([k, v]) =>
        k === 'mapFollow' ? typeof v !== 'boolean' : !choices[k].includes(v),
      )
    )
      throw Error('设置选项无效');
    if (!account) {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        throw Error('浏览器不允许本地保存，请检查存储设置');
      }
      current = next;
      publish();
      return getPreferences();
    }
    let response;
    try {
      response = await fetch('/api/auth/preferences', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      throw Error('设置未保存，网络连接中断，请重试');
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw Error('设置未保存，服务返回异常，请重试');
    }
    if (stamp !== epoch || id !== (account?.id || null)) throw Error('账号已变化，请重新修改设置');
    if (!response.ok) {
      if (response.status === 401) {
        setPreferenceAccount(null);
        window.dispatchEvent(new Event('preferences:unauthorized'));
      }
      throw Error(result.error || '设置未保存，请重试');
    }
    if (!result.preferences || !Number.isSafeInteger(result.revision))
      throw Error('服务器未确认设置保存，请重试');
    current = normalizePreferences(result.preferences);
    revision = result.revision;
    account = { ...account, preferences: current, preferencesRevision: revision };
    publish();
    return getPreferences();
  };
  pending++;
  const job = queue.then(work);
  queue = job.catch(() => {});
  return job.finally(() => pending--);
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey && !account) {
      current = readGuest();
      publish();
    }
  });
