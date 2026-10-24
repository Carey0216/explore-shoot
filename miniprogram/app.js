const api = require('./services/api');
App({
  globalData: { account: null },
  onLaunch() {
    require('./services/appearance').install();
    api.removeExpiredSession();
    require('./services/localization').install();
  },
  onShow() {
    require('./services/public-content').newVisit();
    const page = getCurrentPages().slice(-1)[0];
    void require('./services/appearance').refresh(
      /^pages\/admin(?:-console)?\//.test(page?.route || ''),
    );
  },
  onHide() {
    /* Location is requested on demand; no background location watcher. */
  },
});
