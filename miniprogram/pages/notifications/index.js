const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { shortTime } = require('../../services/model');
Page(
  pageOptions({
    data: {
      items: [],
      unread: 0,
      next: null,
      loading: false,
      error: '',
      category: 'all',
      categories: [
        { id: 'all', title: '全部' },
        { id: 'review', title: '审核' },
        { id: 'activity', title: '活动' },
        { id: 'message', title: '私信' },
        { id: 'announcement', title: '公告' },
        { id: 'system', title: '系统' },
      ],
      selected: [],
      selectedMap: {},
      muted: false,
    },
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
      if (typeof more !== 'boolean') more = false;
      const category = this.data.category,
        serial = (this.serial = (this.serial || 0) + 1);
      this.setData({ loading: true, error: '' });
      try {
        const result = await api.request(
          '/api/notifications?category=' +
            category +
            (more && this.data.next ? '&before=' + this.data.next : ''),
        );
        if (serial !== this.serial) return;
        this.setData({
          items: [
            ...(more ? this.data.items : []),
            ...result.items.map((n) => ({ ...n, time: shortTime(n.createdAt) })),
          ],
          next: result.next,
          unread: result.unread,
          selected: [],
          selectedMap: {},
          muted: Date.parse(result.preferences?.mutedUntil || '') > Date.now(),
        });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        if (serial === this.serial) this.setData({ loading: false });
      }
    },
    category(e) {
      this.setData({ category: e.currentTarget.dataset.id, next: null });
      this.load();
    },
    selection(e) {
      this.setData({
        selected: e.detail.value,
        selectedMap: Object.fromEntries(e.detail.value.map((id) => [id, true])),
      });
    },
    async batch() {
      if (!this.data.selected.length) return;
      try {
        await api.request('/api/notifications/read', 'POST', { ids: this.data.selected });
        await this.load();
      } catch (e) {
        api.message(e);
      }
    },
    async mute() {
      try {
        const r = await new Promise((resolve, reject) =>
          wx.showActionSheet({
            itemList: ['关闭免打扰', '暂停1小时', '暂停8小时', '暂停24小时'],
            success: resolve,
            fail: reject,
          }),
        );
        await api.request('/api/notifications/preferences', 'PATCH', {
          hours: [0, 1, 8, 24][r.tapIndex],
        });
        await this.load();
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) api.message(e);
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
        await api.request('/api/notifications/read', 'POST', {
          all: true,
          category: this.data.category,
        });
        this.load();
      } catch (e) {
        api.message(e);
      }
    },
  }),
);
