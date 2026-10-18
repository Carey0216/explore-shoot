const tabs = [
  { route: 'pages/discover/index', label: '社区', icon: 'compass' },
  { route: 'pages/topics/index', label: '活动', icon: 'calendar' },
  { route: 'pages/map/index', label: '出行', icon: 'route' },
  { route: 'pages/my/index', label: '我的', icon: 'person' },
];
Component({
  data: { tabs, selected: 0, unread: 0, publishGate: false, publishingVisible: true },
  lifetimes: {
    attached() {
      require('../services/api')
        .request('/api/features')
        .then((r) =>
          this.setData({
            publishingVisible:
              r.features.publishing?.enabled !== false && r.features.publishing?.visible !== false,
          }),
        )
        .catch(() => {});
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current) this.sync(current.route);
    },
  },
  methods: {
    sync(route) {
      const selected = tabs.findIndex(
        (tab) => tab.route === (route === 'pages/shots/index' ? 'pages/discover/index' : route),
      );
      if (selected >= 0) this.setData({ selected });
      this.setData({ unread: Number(getApp().globalData.unread) || 0 });
    },
    setUnread(count) {
      const unread = Math.max(0, Number(count) || 0);
      getApp().globalData.unread = unread;
      this.setData({ unread });
    },
    async publish() {
      const api = require('../services/api');
      if (!api.requireLogin()) return;
      try {
        const me = await api.request('/api/auth/me');
        api.updateAccount(me.account);
        if (me.account.scoutStatus === 'approved') wx.navigateTo({ url: '/pages/publish/index' });
        else this.setData({ publishGate: true });
      } catch (e) {
        api.message(e);
      }
    },
    closeGate() {
      this.setData({ publishGate: false, publishingVisible: true });
    },
    noop() {},
    quiz() {
      this.closeGate();
      wx.navigateTo({ url: '/pages/scout/index' });
    },
    select(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!tabs[index] || index === this.data.selected) return;
      wx.switchTab({ url: '/' + tabs[index].route });
    },
  },
});
