const api = require('../../services/api');
Component({
  properties: { active: String },
  data: { initial: '我', unread: 0, messagesVisible: true },
  pageLifetimes: {
    show() {
      const account = api.session()?.account;
      void api
        .request('/api/features')
        .then((r) =>
          this.setData({
            messagesVisible:
              r.features.notifications?.enabled !== false &&
              r.features.notifications?.visible !== false,
          }),
        )
        .catch(() => {});
      this.setData({ unread: 0 });
      this.setData({ initial: (account?.nickname || '我').slice(0, 1) });
      if (account)
        api
          .request('/api/notifications/summary')
          .then((r) => this.setData({ unread: r.badge ?? r.unread }))
          .catch(() => {});
    },
  },
  methods: {
    search() {
      getApp().globalData.focusSpotSearch = true;
      wx.switchTab({ url: '/pages/shots/index' });
    },
    discover() {
      wx.switchTab({ url: '/pages/discover/index' });
    },
    shots() {
      wx.switchTab({ url: '/pages/shots/index' });
    },
    messages() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/notifications/index' });
    },
    my() {
      wx.switchTab({ url: '/pages/my/index' });
    },
  },
});
