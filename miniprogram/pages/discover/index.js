const { pageOptions } = require('../../services/page'),
  api = require('../../services/api'),
  { pointView } = require('../../services/model');
Page(
  pageOptions({
    data: {
      points: [],
      columns: [[], []],
      themes: ['全部', '建筑', '自然', '人文', '运动'],
      theme: '全部',
      query: '',
      loading: false,
      error: '',
      hasMore: false,
      page: 0,
    },
    onShow() {
      if (!this.loadedAt) this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
      this.setData({ loading: false });
    },
    onPullDownRefresh() {
      this.load().finally(() => wx.stopPullDownRefresh());
    },
    onReachBottom() {
      this.more();
    },
    async load(more = false) {
      if (typeof more !== 'boolean') more = false;
      if (more && this.data.loading) return;
      const serial = (this.serial = (this.serial || 0) + 1),
        owner = api.session()?.account.id,
        theme = this.data.theme,
        query = this.data.query,
        page = more ? this.data.page + 1 : 1;
      this.setData({ loading: true, error: '' });
      try {
        const r = await api.request('/api/points/search', 'POST', {
          theme,
          query,
          page,
          pageSize: 12,
        });
        if (serial !== this.serial || owner !== api.session()?.account.id) return;
        const seen = new Set(),
          points = [
            ...(more ? this.data.points : []),
            ...r.points.map((p) => ({
              ...pointView(p),
              shootingLine: require('../../services/content73').shootingLine(p),
            })),
          ].filter((p) => !seen.has(p.id) && seen.add(p.id));
        this.loadedAt = Date.now();
        this.setData({
          points,
          lead: points[0] || null,
          stories: points.slice(1),
          columns: [points.filter((_, i) => i % 2 === 0), points.filter((_, i) => i % 2 === 1)],
          hasMore: r.hasMore,
          page,
        });
      } catch (e) {
        if (serial === this.serial) this.setData({ error: e.message });
      } finally {
        if (serial === this.serial) this.setData({ loading: false });
      }
    },
    pointChanged(e) {
      const point = e.detail.point,
        points = this.data.points
          .map((p) => (p.id === point.id ? { ...p, ...point } : p))
          .sort((a, b) => Number(a.myReaction === 'dislike') - Number(b.myReaction === 'dislike'));
      this.setData({
        points,
        columns: [points.filter((_, i) => i % 2 === 0), points.filter((_, i) => i % 2 === 1)],
      });
    },
    filter(e) {
      this.setData({ theme: e.currentTarget.dataset.id });
      this.load();
    },
    more() {
      if (this.data.hasMore && !this.data.loading) this.load(true);
    },
    open(e) {
      wx.navigateTo({
        url: '/pages/detail/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
    guides() {
      wx.navigateTo({ url: '/pages/guides/index' });
    },
    routes() {
      wx.navigateTo({ url: '/pages/journey/index' });
    },
    passport() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/passport/index' });
    },
  }),
);
