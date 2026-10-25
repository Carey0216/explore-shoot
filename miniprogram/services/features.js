const maintenance = '功能正在维护中，敬请期待…';
let flags = {},
  origin = '';
function snapshot() {
  const next = require('./network').configuredOrigin();
  if (next !== origin) {
    origin = next;
    flags = {};
  }
  return flags;
}
function visible(key) {
  return snapshot()[key]?.visible !== false;
}
function enabled(key) {
  return visible(key) && snapshot()[key]?.enabled !== false;
}
function allow(key) {
  if (!key || enabled(key)) return true;
  wx.showToast({ title: maintenance, icon: 'none', duration: 2200 });
  return false;
}
async function load() {
  const r = await require('./api').cached('/api/features', 5000);
  origin = require('./network').configuredOrigin();
  flags = r.features || {};
  return flags;
}
function forPage(name) {
  return {
    topics: 'topics',
    topic: 'topics',
    passport: 'passport',
    scout: 'scout',
    publish: 'publishing',
    checkin: 'publishing',
    notifications: 'notifications',
    notice: 'notifications',
    contact: 'messages',
    plans: 'plans',
    memories: 'memories',
    collections: 'plans',
    'plan-share': 'plans',
    comparison: 'work-wall',
    journey: 'exploration',
    guides: 'exploration',
    framing: 'framing',
    assistant: 'assistant',
  }[name];
}
const methods = {
  memories: 'memories',
  plans: 'plans',
  plan: 'plans',
  collections: 'plans',
  passport: 'passport',
  contact: 'messages',
  notifications: 'notifications',
  topics: 'topics',
  support: 'support',
  framing: 'framing',
  compare: 'work-wall',
  like: 'reactions',
  dislike: 'reactions',
  confirmDislike: 'reactions',
  bookmark: 'bookmarks',
  report: 'feedback',
  checkin: 'publishing',
  routes: 'exploration',
  guides: 'exploration',
  apply: 'scout',
  startNavigation: 'exploration',
};
module.exports = { maintenance, snapshot, visible, enabled, allow, load, forPage, methods };
