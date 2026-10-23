const api = require('../../services/api'),
  features = require('../../services/features');
Component({
  properties: { point: Object, features: Object },
  data: { current: null, saved: false, busy: false },
  lifetimes: {
    attached() {
      this.offTheme = require('../../services/appearance').subscribe((data) =>
        this.setData({ themeDark: data.themeDark }),
      );
    },
    detached() {
      this.offTheme?.();
    },
  },
  observers: {
    point: function (point) {
      this.setData({
        current: point,
        saved: !!api.session()?.account.bookmarks?.includes(point?.id),
      });
    },
  },
  pageLifetimes: {
    show() {
      this.setData({ saved: !!api.session()?.account.bookmarks?.includes(this.data.point?.id) });
    },
  },
  methods: {
    noop() {},
    async react(e) {
      if (this.data.busy || !features.allow('reactions') || !api.requireLogin()) return;
      const p = this.data.current,
        type = e.currentTarget.dataset.value,
        value = p.myReaction === type ? null : type;
      if (value === 'dislike') {
        const r = await new Promise((resolve) =>
          wx.showModal({
            title: '确认不喜欢该作品？',
            content: '标为不喜欢后，会在后续推荐中排到更后面。',
            success: resolve,
          }),
        );
        if (!r.confirm) return;
      }
      this.setData({ busy: true });
      try {
        const r = await api.request('/api/points/' + p.id + '/reaction', 'PUT', { value });
        const point = { ...p, ...r.point };
        this.setData({ current: point });
        this.triggerEvent('change', { point });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    async bookmark() {
      if (this.data.busy || !features.allow('bookmarks') || !api.requireLogin()) return;
      this.setData({ busy: true });
      try {
        const r = await api.request('/api/bookmarks', 'POST', { pointId: this.data.current.id }),
          s = api.session();
        if (s) api.updateAccount({ ...s.account, bookmarks: r.bookmarks });
        this.setData({ saved: r.bookmarks.includes(this.data.current.id) });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    navigate() {
      getApp().globalData.destination = this.data.current.id;
      getApp().globalData.mapTab = 'navigation';
      wx.switchTab({ url: '/pages/map/index' });
    },
  },
});
