// Reset private pages when the signed-in account changes, including the login-return path.
function pageOptions(definition) {
  const show = definition.onShow;
  const hide = definition.onHide,
    unload = definition.onUnload;
  definition.onHide = function (...args) {
    require('./public-content').hide(this);
    return hide?.apply(this, args);
  };
  definition.onUnload = function (...args) {
    require('./public-content').hide(this);
    return unload?.apply(this, args);
  };
  definition.dismissPublicOverlay = function () {
    this.setData({ announcement: null, publicOverlayOpen: false });
  };
  definition.publicOverlay = function (event) {
    this.setData({ publicOverlayOpen: !!event.detail.open });
  };
  const initial = definition.data || {};
  const privatePages = [
    'pages/checkin/index',
    'pages/passport/index',
    'pages/notifications/index',
    'pages/plans/index',
  ];
  definition.data = {
    ...initial,
    signedIn: false,
    siteLabels: {},
    siteContent: null,
    runtime: null,
    announcement: null,
    publicOverlayOpen: false,
  };
  definition.onShow = function (...args) {
    if (typeof this.getTabBar === 'function') {
      const bar = this.getTabBar();
      if (bar && typeof bar.sync === 'function') bar.sync(this.route);
    }
    const saved = wx.getStorageSync('explore-mini-session-v1');
    const owner = saved && saved.expiresAt > Date.now() && saved.account && saved.account.id;
    if (privatePages.includes(this.route)) {
      const update = this.miniOwner !== owner ? JSON.parse(JSON.stringify(initial)) : {};
      update.signedIn = !!owner;
      this.miniOwner = owner;
      this.setData(update);
    }
    void require('./api')
      .request('/api/features')
      .then((data) => this.setData({ features: data.features }))
      .catch(() => {});
    void require('./public-content').show(this);
    return show && show.apply(this, args);
  };
  return definition;
}
module.exports = { pageOptions };
