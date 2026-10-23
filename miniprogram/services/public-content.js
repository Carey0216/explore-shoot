const api = require('./api');
const network = require('./network');
const model = require('./model');
let visit = model.uuid(),
  shown = false,
  busy = false,
  owner,
  cache,
  cachedOrigin,
  cachedAt = 0;
function newVisit() {
  visit = model.uuid();
  shown = false;
}
function visitor() {
  const key = 'campus-visitor:' + network.configuredOrigin();
  let id = wx.getStorageSync(key);
  if (!/^[a-f0-9-]{36}$/.test(id || '')) {
    id = model.uuid();
    wx.setStorageSync(key, id);
  }
  return id;
}
function pageName(route) {
  return {
    shots: 'shots',
    assistant: 'assistant',
    discover: 'discover',
    map: 'map',
    detail: 'place',
    my: 'me',
    settings: 'settings',
    passport: 'passport',
    checkin: 'checkin',
    notifications: 'notifications',
    topics: 'topics',
    topic: 'topic',
    plans: 'plans',
    guides: 'guides',
    updates: 'updates',
    notes: 'notes',
    journey: 'journey',
    comparison: 'place',
    share: 'place',
    framing: 'place',
    avatar: 'settings',
    publish: 'publish',
    contact: 'contact',
    notice: 'notice',
  }[route.split('/')[1]];
}
async function show(page) {
  const generation = (page.publicGeneration = (page.publicGeneration || 0) + 1);
  const origin = network.configuredOrigin();
  const here = () => page.publicGeneration === generation && origin === network.configuredOrigin();
  try {
    if (!cache || origin !== cachedOrigin || Date.now() - cachedAt > 30000) {
      cachedOrigin = origin;
      cachedAt = Date.now();
      cache = Promise.all([api.request('/api/site-content'), api.request('/api/runtime')]).catch(
        (error) => {
          cache = null;
          throw error;
        },
      );
    }
    const [content, runtime] = await cache;
    if (!here()) return;
    const update = {
      siteContent: content,
      runtime,
      siteLabels: Object.fromEntries(content.categories.map((c) => [c.id, c.label])),
    };
    if (Array.isArray(page.data.conditions))
      update.conditions = page.data.conditions.map((c) => ({
        ...c,
        name: content.conditions.find((r) => r.id === c.id)?.label || c.name,
      }));
    page.setData(update);
    const currentOwner = api.session()?.account.id || 'guest';
    if (currentOwner !== owner) {
      owner = currentOwner;
      newVisit();
    }
    if (shown || busy || page.data.publicOverlayOpen) return;
    const name = pageName(page.route);
    if (!name) return;
    busy = true;
    const entry = visit,
      visitorId = visitor();
    const current = () =>
      here() && entry === visit && currentOwner === (api.session()?.account.id || 'guest');
    try {
      const query = 'channel=mini&page=' + name + '&visitorId=' + visitorId + '&visitId=' + entry;
      const result = await api.request('/api/announcements?' + query);
      if (!result.announcement || !current()) return;
      const claim = await api.request(
        '/api/announcements/' + result.announcement.id + '/impressions',
        'POST',
        {
          channel: 'mini',
          page: name,
          visitorId,
          visitId: entry,
          requestId: model.uuid(),
          revision: result.announcement.revision,
        },
      );
      if (claim.show && current()) {
        shown = true;
        page.setData({ announcement: claim.announcement, publicOverlayOpen: true });
      }
    } finally {
      busy = false;
    }
  } catch {
    /* A failed operational notice must not block login, maps or private records. */
  }
}
function hide(page) {
  page.publicGeneration = (page.publicGeneration || 0) + 1;
  page.setData({ announcement: null, publicOverlayOpen: false });
}
module.exports = { show, hide, newVisit };
