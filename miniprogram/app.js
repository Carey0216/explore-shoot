const api = require('./services/api');
App({
  globalData: { account: null },
  onLaunch() {
    require('./services/appearance').install();
    api.removeExpiredSession();
    wx.removeStorageSync('explore-mini-language');
  },
  onShow() {
    require('./services/public-content').newVisit();
  },
  onHide() {
    /* Location is requested on demand; no background location watcher. */
  },
});
