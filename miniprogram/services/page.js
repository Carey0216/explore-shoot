// Retained views are scoped to backend and account; hide is not logout.
function pageOptions(definition, { administrator = false } = {}) {
  const show = definition.onShow,
    hide = definition.onHide,
    unload = definition.onUnload;
  const initial = JSON.parse(JSON.stringify(definition.data || {}));
  definition.data = {
    ...initial,
    signedIn: false,
    siteLabels: {},
    siteContent: null,
    runtime: null,
    announcement: null,
    publicOverlayOpen: false,
    nativePage: '',
    nativeOverlayOpen: false,
    dockOverlayOpen: false,
    featureBlocked: false,
    features: require('./features').snapshot(),
    ...require('./appearance').snapshot(),
  };
  definition.onShow = async function (...args) {
    this.nativeVisible = true;
    const adminMode = administrator || this.asAdmin === true;
    const api = require(adminMode ? './admin-api' : './api'),
      saved = api.session();
    const owner = require('./network').configuredOrigin() + ':' + (saved?.account?.id || 'guest');
    if (this.miniOwner && this.miniOwner !== owner) {
      this.loadedAt = 0;
      this.setData({ ...JSON.parse(JSON.stringify(initial)), signedIn: !!saved });
    }
    this.miniOwner = owner;
    this.setData({ signedIn: !!saved });
    if (this.dataRevision !== (getApp().globalData.mutationVersion || 0)) {
      this.loadedAt = 0;
      this.dataRevision = getApp().globalData.mutationVersion || 0;
    }
    const appearance = require('./appearance');
    appearance.account(saved?.account, adminMode);
    this.offAppearance?.();
    this.offAppearance = appearance.subscribe((data) => this.setData(data));
    const bar = this.getTabBar?.();
    if (bar?.sync) bar.sync(this.route);
    this.setData({ nativePage: this.route.split('/')[1], nativeAccount: saved?.account || null });
    if (!adminMode) {
      const features = require('./features');
      try {
        const flags = await features.load();
        if (!this.nativeVisible || owner !== this.miniOwner) return;
        const key = features.forPage(this.route.split('/')[1]);
        this.setData({ features: flags, featureBlocked: !!key && !features.enabled(key) });
        this.getTabBar?.()?.featuresChanged?.();
        this.featuresChanged?.(flags);
      } catch (_) {
        if (!this.nativeVisible || owner !== this.miniOwner) return;
      }
      void require('./public-content').show(this);
      const key = features.forPage(this.route.split('/')[1]);
      if (key && !features.allow(key)) {
        this.setData({ featureBlocked: true });
        return;
      }
    }
    return show?.apply(this, args);
  };
  definition.onHide = function (...args) {
    this.nativeVisible = false;
    this.offAppearance?.();
    require('./public-content').hide(this);
    return hide?.apply(this, args);
  };
  definition.onUnload = function (...args) {
    this.nativeVisible = false;
    this.offAppearance?.();
    require('./public-content').hide(this);
    return unload?.apply(this, args);
  };
  if (!administrator)
    for (const [method, key] of Object.entries(require('./features').methods)) {
      const original = definition[method];
      if (typeof original === 'function')
        definition[method] = function (...args) {
          if (require('./features').allow(key)) return original.apply(this, args);
        };
    }
  definition.featureTap = function (e) {
    require('./features').allow(e.currentTarget.dataset.feature);
  };
  definition.nativeOverlay = function (e) {
    this.setData({ nativeOverlayOpen: !!e.detail.open });
  };
  definition.dismissPublicOverlay = function () {
    this.setData({ announcement: null, publicOverlayOpen: false });
  };
  definition.publicOverlay = function (e) {
    this.setData({ publicOverlayOpen: !!e.detail.open });
  };
  return require('./localization').page(definition, administrator);
}
module.exports = { pageOptions };
