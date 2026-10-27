import { startLocalization } from './localization.js';
import { getPreferences, subscribePreferences } from './preferences.js';

let started = false;
// Text size and reduced motion remain available independently of the retired translation system.
export function startDisplayPreferences() {
  if (started) return;
  started = true;
  const apply = () => {
    const preference = getPreferences();
    startLocalization();
    document.documentElement.dataset.textSize = preference.textSize;
    delete document.documentElement.dataset.motion;
    window.campusAppearance?.set(preference.appearance);
    window.campusStartup?.configure(preference);
  };
  subscribePreferences(apply);
  apply();
}
