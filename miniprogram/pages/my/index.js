const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: {
      account: null,
      records: [],
      works: [],
      summary: {},
      unread: 0,
      loading: false,
      error: '',
    },
    collections() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/collections/index' });
    },
    plans() {
      wx.navigateTo({ url: '/pages/plans/index' });
    },
    topics() {
      wx.switchTab({ url: '/pages/topics/index' });
    },
    support() {
      wx.navigateTo({ url: '/pages/assistant/index?purpose=support' });
    },
    dismissRewards() {
      this.setData({ passportRewards: [] });
    },
    contact() {
      wx.navigateTo({ url: '/pages/contact/index' });
    },
    administration() {
      wx.navigateTo({ url: '/pages/admin/index' });
    },
    onShow() {
      const event = getApp().globalData.pendingPassportRewards;
      getApp().globalData.pendingPassportRewards = null;
      this.setData({
        passportRewards:
          event && event.owner === api.session()?.account.id
            ? [
                ...(event.events.achievements || []),
                ...(event.events.buildings || []),
                ...(event.events.places || []),
              ].map((r) => ({
                ...r,
                badge: api.asset('/shared/badges/' + (r.badgePreset || 'badge-01') + '.png', false),
              }))
            : [],
      });
      this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
      this.setData({ records: [], works: [], loading: false });
    },
    onPullDownRefresh() {
      this.load().finally(() => wx.stopPullDownRefresh());
    },
    async load() {
      const serial = (this.serial = (this.serial || 0) + 1);
      api.removeExpiredSession();
      this.setData({
        account: api.session() && api.session().account,
        records: [],
        works: [],
        error: '',
      });
      if (!api.session()) return;
      this.setData({ loading: true });
      try {
        const [me, library, works] = await Promise.all([
          api.request('/api/auth/me'),
          api.request('/api/my/library'),
          api.request('/api/my/works'),
        ]);
        if (serial !== this.serial) return;
        api.updateAccount(me.account);
        const status = {
          pending: '待审核',
          approved: '已公开',
          rejected: '未通过',
          hidden: '已隐藏',
          withdrawn: '已撤回',
        };
        this.setData({
          account: me.account,
          summary: library.summary,
          records: library.records.map((r) => ({
            ...r,
            photo: r.mediaId ? '/media/' + r.mediaId : '',
            date: String(r.createdAt || '').slice(0, 10),
          })),
          works: works.items.map((w) => ({ ...w, statusText: status[w.status] || w.status })),
          unread: me.unreadNotifications,
        });
        const notice = await api.request('/api/notifications/summary').catch(() => ({ badge: 0 }));
        if (serial !== this.serial) return;
        getApp().globalData.unread = Number(notice.badge) || 0;
        const bar = this.getTabBar && this.getTabBar();
        if (bar && bar.setUnread) bar.setUnread(notice.badge);
      } catch (e) {
        if (serial === this.serial) this.setData({ error: e.message });
      } finally {
        if (serial === this.serial) this.setData({ loading: false });
      }
    },
    login() {
      wx.navigateTo({ url: '/pages/login/index' });
    },
    passport() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/passport/index' });
    },
    notifications() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/notifications/index' });
    },
    settings() {
      wx.navigateTo({ url: '/pages/settings/index' });
    },
    async preview(e) {
      try {
        const path = await api.download(e.currentTarget.dataset.photo, false);
        wx.previewImage({ urls: [path] });
      } catch (e) {
        api.message(e);
      }
    },
    withdraw(e) {
      wx.showModal({
        title: '撤回公开作品？',
        content: '撤回后其他人不可再查看；私人打卡记录继续保留。',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            await api.request('/api/checkins/' + e.currentTarget.dataset.id + '/sharing', 'PUT', {
              public: false,
            });
            this.load();
          } catch (err) {
            api.message(err);
          }
        },
      });
    },
    remove(e) {
      wx.showModal({
        title: '删除这条打卡？',
        content: '关联的公开作品也会移除，此操作不可撤销。',
        confirmColor: '#af4d50',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            await api.request('/api/checkins/' + e.currentTarget.dataset.id, 'DELETE');
            this.load();
          } catch (err) {
            api.message(err);
          }
        },
      });
    },
  }),
);
