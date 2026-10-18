const api = require('./api');
async function open(value) {
  const href = String(value || '');
  if (/^https:\/\//.test(href)) {
    wx.showModal({
      title: '外部链接',
      content: href,
      confirmText: '复制链接',
      success: (r) => {
        if (r.confirm) wx.setClipboardData({ data: href });
      },
    });
    return;
  }
  if (href.startsWith('#spot/')) {
    try {
      const spot = await api.request('/api/shooting-spots/' + href.split('/')[1]);
      return wx.navigateTo({
        url:
          '/pages/detail/index?id=' +
          encodeURIComponent(spot.pointId) +
          '&spot=' +
          encodeURIComponent(spot.id),
      });
    } catch (e) {
      api.message(e);
      return;
    }
  }
  const path = href.replace(/^#/, ''),
    parts = path.split('/'),
    id = parts[1] || '';
  const tabs = {
    discover: 'discover',
    shots: 'shots',
    topics: 'topics',
    map: 'map',
    navigate: 'map',
    routes: 'map',
    me: 'my',
    'my-works': 'my',
  };
  if (tabs[parts[0]]) return wx.switchTab({ url: '/pages/' + tabs[parts[0]] + '/index' });
  const pages = {
    place: 'detail',
    spot: 'detail',
    passport: 'passport',
    notifications: 'notifications',
    notice: 'notice',
    contact: 'contact',
    conversation: 'contact',
    publish: 'publish',
    plans: 'plans',
    settings: 'settings',
    support: 'assistant',
    topic: 'topic',
  };
  const name = pages[parts[0]];
  if (!name) {
    api.message(Error('此窗口暂不能在小程序打开，请返回相关栏目'));
    return;
  }
  if (
    [
      'publish',
      'passport',
      'contact',
      'conversation',
      'notifications',
      'notice',
      'settings',
      'plans',
    ].includes(parts[0]) &&
    !api.requireLogin()
  )
    return;
  wx.navigateTo({
    url:
      '/pages/' +
      name +
      '/index' +
      (id
        ? '?' +
          (parts[0] === 'conversation' ? 'thread' : parts[0] === 'spot' ? 'spot' : 'id') +
          '=' +
          encodeURIComponent(id)
        : ''),
  });
}
module.exports = { open };
