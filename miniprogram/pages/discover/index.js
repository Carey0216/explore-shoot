const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { pointView } = require('../../services/model');
Page(
  pageOptions({
    data: {
      points: [],
      columns: [[], []],
      themes: [],
      theme: '全部',
      loading: false,
      error: '',
      hasMore: false,
    },
    onShow() {
      this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
      this.allPoints = [];
      this.setData({ points: [], columns: [[], []], loading: false });
    },
    async load() {
      const serial = (this.serial = (this.serial || 0) + 1);
      this.setData({ loading: true, error: '' });
      try {
        const result = await api.request('/api/catalog');
        if (serial !== this.serial) return;
        const byId = new Map(result.points.map((p) => [p.id, p]));
        this.allPoints = (result.popularPointIds || result.points.map((p) => p.id))
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map(pointView)
          .sort((a, b) => Number(a.myReaction === 'dislike') - Number(b.myReaction === 'dislike'));
        this.limit = 12;
        this.setData({
          themes: ['全部', ...new Set(result.points.map((p) => p.theme).filter(Boolean))],
        });
        this.updateFeed();
      } catch (e) {
        if (serial === this.serial) this.setData({ error: e.message });
      } finally {
        if (serial === this.serial) this.setData({ loading: false });
      }
    },
    updateFeed() {
      const all = (this.allPoints || []).filter(
          (p) => this.data.theme === '全部' || p.theme === this.data.theme,
        ),
        points = all.slice(0, this.limit || 12);
      this.setData({
        points,
        columns: [points.filter((_, i) => i % 2 === 0), points.filter((_, i) => i % 2 === 1)],
        hasMore: all.length > points.length,
      });
    },
    filter(e) {
      this.limit = 12;
      this.setData({ theme: e.currentTarget.dataset.id });
      this.updateFeed();
    },
    more() {
      this.limit = (this.limit || 12) + 12;
      this.updateFeed();
    },
    open(e) {
      wx.navigateTo({
        url: '/pages/detail/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
    passport() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/passport/index' });
    },
  }),
);
