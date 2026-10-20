import { getPreferences, subscribePreferences } from './preferences.js';

let started = false;
// Text size and reduced motion remain available independently of the retired translation system.
export function startDisplayPreferences() {
  if (started) return;
  started = true;
  const apply = () => {
    const preference = getPreferences();
    document.documentElement.lang = 'zh-CN';
    document.documentElement.dataset.textSize = preference.textSize;
    document.documentElement.dataset.motion = preference.motion;
    window.campusAppearance?.set(preference.appearance, preference.motion);
    window.campusStartup?.configure(preference);
  };
  subscribePreferences(apply);
  apply();
}
