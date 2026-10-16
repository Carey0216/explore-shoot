// Reset private pages when the signed-in account changes, including the login-return path.
function pageOptions(definition) {
  const show = definition.onShow;
  const initial = definition.data || {};
  const privatePages = ['pages/checkin/index', 'pages/passport/index', 'pages/notifications/index'];
  definition.data = { ...initial, signedIn: false };
  definition.onShow = function (...args) {
    const saved = wx.getStorageSync('explore-mini-session-v1');
    const owner = saved && saved.expiresAt > Date.now() && saved.account && saved.account.id;
    if (privatePages.includes(this.route)) {
      const update = this.miniOwner !== owner ? JSON.parse(JSON.stringify(initial)) : {};
      update.signedIn = !!owner;
      this.miniOwner = owner;
      this.setData(update);
    }
    return show && show.apply(this, args);
  };
  return definition;
}
module.exports = { pageOptions };
