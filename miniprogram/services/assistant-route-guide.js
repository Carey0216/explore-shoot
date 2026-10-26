const api = require('./api'),
  network = require('./network');
let pending;
const pages = {
  publish: 'publish',
  settings: 'settings',
  plans: 'plans',
  guides: 'guides',
  contact: 'contact',
  me: 'my',
  shots: 'shots',
};
function queue(link) {
  const steps = require('./assistant-guidance').assistantGuidance(link);
  pending = steps.length
    ? {
        steps,
        owner: api.session()?.account.id || 'guest',
        origin: network.configuredOrigin(),
        page: pages[link.path.slice(1)],
        at: Date.now(),
      }
    : null;
}
function consume(page) {
  const task = pending;
  if (!task) return;
  if (
    Date.now() - task.at > 30000 ||
    task.owner !== (api.session()?.account.id || 'guest') ||
    task.origin !== network.configuredOrigin()
  ) {
    pending = null;
    return;
  }
  if ((page.route || page.nativeResolvedRoute) !== 'pages/' + task.page + '/index') return;
  pending = null;
  let attempts = 0;
  const show = () => {
    if (!page.nativeVisible || task.owner !== (api.session()?.account.id || 'guest')) return;
    const layer = page.selectComponent?.('#experience');
    if (layer && !layer.data.tour && !layer.data.unreadUpdate) layer.assistantGuide(task.steps);
    else if (++attempts < 12) setTimeout(show, 250);
  };
  wx.nextTick(show);
}
module.exports = { queue, consume };
