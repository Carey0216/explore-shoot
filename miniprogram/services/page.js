// Retained views are scoped to backend and account; hide is not logout.
function pageOptions(definition, { administrator = false } = {}) {
  const show = definition.onShow,
    hide = definition.onHide,
    unload = definition.onUnload,
    ready = definition.onReady;
  const scroll = definition.onPageScroll;
  definition.onPageScroll = function (e) {
    this.retainedScrollY = e.scrollTop;
    return scroll?.call(this, e);
  };
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
  definition.onReady = function (...args) {
    const result = ready?.apply(this, args);
    if (this.nativeRoutePending) {
      this.nativeRoutePending = false;
      void definition.onShow.call(this);
    }
    return result;
  };
  definition.onShow = async function (...args) {
    const stack = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const route =
      this.route || this.__route__ || stack.find((p) => p === this)?.route || stack.at(-1)?.route;
    if (!route) {
      this.nativeRoutePending = true;
      return;
    }
    this.nativeResolvedRoute = route;
    this.nativeVisible = true;
    const adminMode = administrator || this.asAdmin === true;
    const api = require(adminMode ? './admin-api' : './api'),
      saved = api.session();
    const owner = require('./network').configuredOrigin() + ':' + (saved?.account?.id || 'guest');
    if (this.miniOwner && this.miniOwner !== owner) {
      this.loadedAt = 0;
      this.retainedScrollY = 0;
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
    if (bar?.sync) bar.sync(route);
    this.setData({ nativePage: route.split('/')[1], nativeAccount: saved?.account || null });
    if (!adminMode) {
      const features = require('./features');
      try {
        const flags = await features.load();
        if (!this.nativeVisible || owner !== this.miniOwner) return;
        const key = features.forPage(route.split('/')[1]);
        this.setData({ features: flags, featureBlocked: !!key && !features.enabled(key) });
        this.getTabBar?.()?.featuresChanged?.();
        this.featuresChanged?.(flags);
      } catch (_) {
        if (!this.nativeVisible || owner !== this.miniOwner) return;
      }
      void require('./public-content').show(this);
      const key = features.forPage(route.split('/')[1]);
      if (key && !features.allow(key)) {
        this.setData({ featureBlocked: true });
        return;
      }
    }
    const y = this.retainedScrollY || 0;
    await show?.apply(this, args);
    if (!adminMode && this.nativeVisible) require('./assistant-route-guide').consume(this);
    if (y > 0 && this.nativeVisible && this.miniOwner === owner)
      wx.nextTick?.(() => {
        if (this.nativeVisible && this.miniOwner === owner)
          wx.pageScrollTo({ scrollTop: y, duration: 0 });
      });
  };
  definition.onHide = function (...args) {
    this.nativeRoutePending = false;
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
    if (this.nativeVisible)
      this.getTabBar?.()?.setData({
        pageOverlayOpen: !!(e.detail.open || this.data.publicOverlayOpen),
      });
  };
  definition.dismissPublicOverlay = function () {
    this.setData({ announcement: null, publicOverlayOpen: false });
    if (this.nativeVisible)
      this.getTabBar?.()?.setData({ pageOverlayOpen: !!this.data.nativeOverlayOpen });
  };
  definition.publicOverlay = function (e) {
    this.setData({ publicOverlayOpen: !!e.detail.open });
    if (this.nativeVisible)
      this.getTabBar?.()?.setData({
        pageOverlayOpen: !!(e.detail.open || this.data.nativeOverlayOpen),
      });
  };
  return require('./localization').page(definition, administrator);
}
module.exports = { pageOptions };
