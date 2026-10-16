const tabs = [
  { route: 'pages/shots/index', label: '机位', icon: 'camera' },
  { route: 'pages/discover/index', label: '发现', icon: 'compass' },
  { route: 'pages/map/index', label: '出行', icon: 'route' },
  { route: 'pages/my/index', label: '我的', icon: 'person' },
];
Component({
  data: { tabs, selected: 0, unread: 0 },
  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current) this.sync(current.route);
    },
  },
  methods: {
    sync(route) {
      const selected = tabs.findIndex((tab) => tab.route === route);
      if (selected >= 0) this.setData({ selected });
      this.setData({ unread: Number(getApp().globalData.unread) || 0 });
    },
    setUnread(count) {
      const unread = Math.max(0, Number(count) || 0);
      getApp().globalData.unread = unread;
      this.setData({ unread });
    },
    select(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!tabs[index] || index === this.data.selected) return;
      wx.switchTab({ url: '/' + tabs[index].route });
    },
  },
});
