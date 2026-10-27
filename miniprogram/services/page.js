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
    nativeRewardItems812: [],
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
    if (!adminMode) {
      const isPublic = require('./share-brand').publicPages.has(route.split('/')[1]);
      wx.showShareMenu?.({
        menus: isPublic ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'],
      });
    }
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
    this.presentPendingRewards813?.();
    if (!adminMode && this.nativeVisible) require('./assistant-route-guide').consume(this);
    if (y > 0 && this.nativeVisible && this.miniOwner === owner)
      wx.nextTick?.(() => {
        if (this.nativeVisible && this.miniOwner === owner)
          wx.pageScrollTo({ scrollTop: y, duration: 0 });
      });
  };
  definition.onHide = function (...args) {
    this.handoffPassportReceipt813?.();
    clearTimeout(this.pendingRewardTimer813);
    this.getTabBar?.()?.setData({ impact813: false });
    if (this.data.nativeRewardItems812?.length) getApp().globalData.nativeRewardActive813 = false;
    this.nativeRoutePending = false;
    clearTimeout(this.impactTimer812);
    if (this.data.nativeImpact812) this.setData({ nativeImpact812: false });
    this.nativeVisible = false;
    this.offAppearance?.();
    require('./public-content').hide(this);
    return hide?.apply(this, args);
  };
  definition.onUnload = function (...args) {
    this.handoffPassportReceipt813?.();
    clearTimeout(this.pendingRewardTimer813);
    this.getTabBar?.()?.setData({ impact813: false });
    if (this.data.nativeRewardItems812?.length) getApp().globalData.nativeRewardActive813 = false;
    clearTimeout(this.impactTimer812);
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
  definition.presentPendingRewards813 = function () {
    const api = require('./api');
    if (this.data.nativeRewardItems812?.length) {
      getApp().globalData.nativeRewardActive813 = true;
      return;
    }
    if (!administrator && this.nativeVisible) {
      if (
        this.data.nativeOverlayOpen ||
        this.data.publicOverlayOpen ||
        this.data.saving ||
        this.completed
      ) {
        clearTimeout(this.pendingRewardTimer813);
        this.pendingRewardTimer813 = setTimeout(() => this.presentPendingRewards813(), 600);
        return;
      }
      const pending = getApp().globalData.pendingPassportRewards;
      if (pending) {
        getApp().globalData.pendingPassportRewards = null;
        if (
          pending.owner === api.session()?.account.id &&
          pending.origin === require('./network').configuredOrigin()
        ) {
          this.activePassportReceipt813 = pending;
          const e = pending.events || {};
          const landing = e.atlas && e.buildings?.length ? e : e.revisit;
          const map =
            landing?.atlas && landing.buildings?.length
              ? [
                  {
                    id: 'atlas',
                    revisit: landing !== e,
                    title: landing.buildings.map((b) => b.title).join('、'),
                    atlas: landing.atlas,
                    revealed: landing.buildings.map((b) => b.id),
                    revealKey: landing.buildings.map((b) => b.id).join(','),
                    description:
                      landing === e
                        ? '本次打卡已点亮校园建筑'
                        : '建筑已经点亮，这次打卡也已保存，重温建筑落位',
                  },
                ]
              : [];
          this.setData({
            nativeRewardItems812: [
              ...map,
              ...(e.achievements || []),
              ...(!e.atlas ? e.buildings || [] : []),
              ...(e.places || []),
              ...(!map.length && !e.achievements?.length && !e.places?.length && e.recorded
                ? [
                    {
                      id: 'recorded',
                      title: '这次打卡，已好好收下',
                      description: '去校园收集图看看下一栋可以在哪里点亮',
                      badgePreset: 'badge-02',
                    },
                  ]
                : []),
            ].map((r) => ({
              ...r,
              badge: api.asset('/shared/badges/' + (r.badgePreset || 'badge-01') + '.png', false),
            })),
          });
          getApp().globalData.nativeRewardActive813 = !!this.data.nativeRewardItems812.length;
          this.getTabBar?.()?.setData({
            pageOverlayOpen: !!(this.data.nativeOverlayOpen || this.data.publicOverlayOpen),
          });
        }
      }
    }
  };
  definition.handoffPassportReceipt813 = function () {
    if (this.activePassportReceipt813 && this.data.nativeRewardItems812?.length) {
      getApp().globalData.pendingPassportRewards ||= this.activePassportReceipt813;
      this.activePassportReceipt813 = null;
      this.setData({ nativeRewardItems812: [] });
      getApp().globalData.nativeRewardActive813 = false;
    }
  };
  definition.nativeImpact812 = function (event) {
    if (event?.detail?.reset) {
      clearTimeout(this.impactTimer812);
      this.setData({ nativeImpact812: false });
      this.getTabBar?.()?.setData({ impact813: false });
      return;
    }
    this.setData({ nativeImpact812: true });
    this.getTabBar?.()?.setData({ impact813: true });
    clearTimeout(this.impactTimer812);
    this.impactTimer812 = setTimeout(() => {
      if (this.nativeVisible) this.setData({ nativeImpact812: false });
      this.getTabBar?.()?.setData({ impact813: false });
    }, 700);
  };
  definition.dismissNativeRewards812 = function () {
    this.activePassportReceipt813 = null;
    getApp().globalData.nativeRewardActive813 = false;
    clearTimeout(this.impactTimer812);
    this.setData({ nativeRewardItems812: [], nativeImpact812: false });
    this.getTabBar?.()?.setData({ impact813: false });
    this.getTabBar?.()?.setData({
      pageOverlayOpen: !!(this.data.nativeOverlayOpen || this.data.publicOverlayOpen),
    });
    this.presentPendingRewards813?.();
    this.selectComponent?.('#experience')?.selectComponent?.('#collection-guide813')?.refresh?.();
  };
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
      this.getTabBar?.()?.setData({
        pageOverlayOpen: !!this.data.nativeOverlayOpen,
      });
  };
  definition.publicOverlay = function (e) {
    this.setData({ publicOverlayOpen: !!e.detail.open });
    if (this.nativeVisible)
      this.getTabBar?.()?.setData({
        pageOverlayOpen: !!(e.detail.open || this.data.nativeOverlayOpen),
      });
  };
  if (!administrator) require('./share-brand').install(definition);
  return require('./localization').page(definition, administrator);
}
module.exports = { pageOptions };
