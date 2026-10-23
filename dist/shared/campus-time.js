import { getPreferences, updatePreferences, subscribePreferences } from './preferences.js';
import { featureOn, featureVisible, allowFeature } from './features.js';
import { icon, toast } from './ui.js';

// Device-local time, deliberately independent of the app's light/dark appearance.
export function campusPeriod(preference = 'auto', date = new Date(), enabled = true) {
  if (!enabled) return 'day';
  if (preference === 'day' || preference === 'evening') return preference;
  return date.getHours() >= 18 || date.getHours() < 7 ? 'evening' : 'day';
}
export const campusTimeHTML = () =>
  `<div class="campus-time-control" data-feature="campus-time" role="group" aria-label="校园时段"><span>${icon('sun')} 校园时段</span><select aria-label="校园时段" data-campus-time><option value="auto">跟随时间</option><option value="day">白天</option><option value="evening">傍晚</option></select><small data-campus-period></small></div>`;

export function watchCampusTime(root, onPeriod) {
  const control = root.querySelector('.campus-time-control'),
    select = root.querySelector('[data-campus-time]');
  let last,
    disposed = false;
  const refresh = () => {
    if (disposed) return;
    const p = getPreferences(),
      enabled = featureOn('campus-time') && featureVisible('campus-time');
    if (control) control.hidden = !featureVisible('campus-time');
    if (select) select.value = p.campusTime;
    const period = campusPeriod(p.campusTime, new Date(), enabled);
    const label = root.querySelector('[data-campus-period]');
    if (label)
      label.textContent = `${p.campusTime === 'auto' ? '当前 · ' : ''}${period === 'evening' ? '傍晚' : '白天'}`;
    if (period !== last) {
      last = period;
      onPeriod(period);
    }
  };
  const change = async () => {
    if (!allowFeature('campus-time')) {
      refresh();
      return;
    }
    select.disabled = true;
    try {
      await updatePreferences({ campusTime: select.value });
    } catch (e) {
      toast(e.message);
    } finally {
      if (!disposed) {
        select.disabled = false;
        refresh();
      }
    }
  };
  select?.addEventListener('change', change);
  const off = subscribePreferences(refresh),
    timer = setInterval(refresh, 15000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('features:change', refresh);
  refresh();
  return () => {
    disposed = true;
    clearInterval(timer);
    off();
    select?.removeEventListener('change', change);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('features:change', refresh);
  };
}
