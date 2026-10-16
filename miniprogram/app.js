const api = require('./services/api');
App({
  globalData: { account: null },
  onLaunch() {
    api.removeExpiredSession();
    wx.removeStorageSync('explore-mini-language');
  },
  onHide() {
    /* Location is requested on demand; no background location watcher. */
  },
});
