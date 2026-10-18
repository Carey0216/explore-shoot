const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: { items: [], unread: 0, next: null, loading: false, error: '' },
    onShow() {
      if (api.requireLogin()) this.load();
    },
    onPullDownRefresh() {
      this.load().finally(() => wx.stopPullDownRefresh());
    },
    onReachBottom() {
      if (this.data.next && !this.data.loading) this.load(true);
    },
    async load(more = false) {
      this.setData({ loading: true, error: '' });
      try {
        const result = await api.request(
          '/api/notifications' + (more && this.data.next ? '?before=' + this.data.next : ''),
        );
        this.setData({
          items: [...(more ? this.data.items : []), ...result.items],
          next: result.next,
          unread: result.unread,
        });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    open(e) {
      wx.navigateTo({ url: '/pages/notice/index?id=' + e.currentTarget.dataset.id });
    },
    async read(e) {
      try {
        await api.request('/api/notifications/read', 'POST', { id: e.currentTarget.dataset.id });
        this.setData({
          items: this.data.items.map((n) =>
            n.id === e.currentTarget.dataset.id ? { ...n, readAt: 'read' } : n,
          ),
        });
        const summary = await api.request('/api/notifications/summary');
        this.setData({ unread: summary.unread });
      } catch (e) {
        api.message(e);
      }
    },
    async all() {
      try {
        await api.request('/api/notifications/read', 'POST', { all: true });
        this.load();
      } catch (e) {
        api.message(e);
      }
    },
  }),
);
