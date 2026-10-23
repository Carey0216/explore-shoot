function campusPeriod(preference = 'auto', date = new Date(), enabled = true) {
  if (!enabled) return 'day';
  if (preference === 'day' || preference === 'evening') return preference;
  return date.getHours() >= 18 || date.getHours() < 7 ? 'evening' : 'day';
}
function current() {
  const features = require('./features');
  return campusPeriod(
    require('./appearance').snapshot().preferences.campusTime,
    new Date(),
    features.enabled('campus-time'),
  );
}
module.exports = { campusPeriod, current };
