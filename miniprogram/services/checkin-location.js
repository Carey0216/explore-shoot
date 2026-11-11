// Leave a margin before the server's 30-second freshness limit.
const CHECKIN_LOCATION_TTL = 25000;

function usableCheckinLocation(fix, now = Date.now()) {
  return (
    !!fix &&
    Number.isFinite(fix.lng) &&
    Math.abs(fix.lng) <= 180 &&
    Number.isFinite(fix.lat) &&
    Math.abs(fix.lat) <= 90 &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy >= 0 &&
    fix.accuracy <= 80 &&
    Number.isFinite(fix.at) &&
    fix.at <= now + 1000 &&
    now - fix.at < CHECKIN_LOCATION_TTL
  );
}

module.exports = { CHECKIN_LOCATION_TTL, usableCheckinLocation };
