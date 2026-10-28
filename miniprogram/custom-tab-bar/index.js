const tabs = [
  { route: 'pages/discover/index', label: '社区', icon: 'compass', art: 'community' },
  { route: 'pages/topics/index', label: '活动', icon: 'calendar', art: 'activities' },
  { route: 'pages/map/index', label: '出行', icon: 'walk' },
  { route: 'pages/my/index', label: '我的', icon: 'person' },
];
Component(
  require('../services/localization').component({
    data: {
      tabs,
      selected: 0,
      unread: 0,
      publishGate: false,
      publishingVisible: true,
      pageOverlayOpen: false,
    },
    lifetimes: {
      attached() {
        this.offAppearance = require('../services/appearance').subscribe((data) =>
          this.setData(data),
        );
        require('../services/api')
          .cached('/api/features', 5000)
          .then((r) =>
            this.setData({
              publishingVisible: r.features.publishing?.visible !== false,
            }),
          )
          .catch(() => {});
        const pages = getCurrentPages();
        const current = pages[pages.length - 1];
        if (current) this.sync(current.route);
      },
      detached() {
        this.offAppearance?.();
      },
    },
    methods: {
      featuresChanged() {
        const features = require('../services/features');
        const selectedRoute = this.data.tabs[this.data.selected]?.route;
        const visible = tabs.filter(
          (t) => t.route !== 'pages/topics/index' || features.visible('topics'),
        );
        this.setData({
          tabs: visible,
          publishingVisible: features.visible('publishing'),
          compact: visible.length !== 4 || !features.visible('publishing'),
        });
        if (selectedRoute) this.sync(selectedRoute);
      },
      sync(route) {
        const current = getCurrentPages().slice(-1)[0];
        this.setData({
          pageOverlayOpen: !!(
            current?.data.nativeOverlayOpen ||
            current?.data.publicOverlayOpen ||
            (current?.data.nativeRewardItems812?.length &&
              !current.data.nativeRewardItems812.some((item) => item.atlas))
          ),
        });
        const selected = (this.data.tabs || tabs).findIndex(
          (tab) => tab.route === (route === 'pages/shots/index' ? 'pages/discover/index' : route),
        );
        if (selected >= 0 && selected !== this.data.selected) this.setData({ selected });
        this.setData({ unread: Number(getApp().globalData.unread) || 0 });
      },
      setUnread(count) {
        const unread = Math.max(0, Number(count) || 0);
        getApp().globalData.unread = unread;
        this.setData({ unread });
      },
      async publish() {
        const api = require('../services/api');
        if (!require('../services/features').allow('publishing')) return;
        if (!api.requireLogin()) return;
        try {
          const me = await api.request('/api/auth/me');
          api.updateAccount(me.account);
          if (me.account.scoutStatus === 'approved') wx.navigateTo({ url: '/pages/publish/index' });
          else this.gate(true);
        } catch (e) {
          api.message(e);
        }
      },
      gate(value) {
        const pages = getCurrentPages();
        pages[pages.length - 1]?.setData({ dockOverlayOpen: value });
        this.setData({ publishGate: value });
      },
      closeGate() {
        this.gate(false);
      },
      noop() {},
      quiz() {
        this.closeGate();
        wx.navigateTo({ url: '/pages/scout/index' });
      },
      select(event) {
        const index = Number(event.currentTarget.dataset.index),
          tabs = this.data.tabs;
        if (
          tabs[index]?.route === 'pages/topics/index' &&
          !require('../services/features').allow('topics')
        )
          return;
        if (!tabs[index] || index === this.data.selected) return;
        if (this.switching) return;
        this.switching = true;
        this.setData({ selected: index });
        wx.switchTab({
          url: '/' + tabs[index].route,
          fail: () => {
            const p = getCurrentPages();
            this.sync(p[p.length - 1]?.route);
          },
          complete: () => {
            this.switching = false;
          },
        });
      },
    },
  }),
);
