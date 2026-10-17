const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const model = require('../../services/model');
Page(
  pageOptions({
    data: {
      query: '',
      filter: 'all',
      condition: '',
      conditions: model.conditions,
      filters: [
        { id: 'all', name: '综合' },
        { id: 'nearby', name: '附近' },
        { id: 'popular', name: '热门' },
        { id: 'saved', name: '收藏' },
      ],
      points: [],
      loading: false,
      error: '',
      hasMore: false,
      page: 1,
    },
    onShow() {
      void api.request('/api/catalog').catch(() => {});
      this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
      this.setData({ loading: false });
    },
    onUnload() {
      this.serial = (this.serial || 0) + 1;
    },
    onPullDownRefresh() {
      this.load().finally(() => wx.stopPullDownRefresh());
    },
    onReachBottom() {
      if (this.data.hasMore && !this.data.loading) this.load(true);
    },
    query(e) {
      this.setData({ query: e.detail.value });
    },
    search() {
      this.load();
    },
    async filter(e) {
      const filter = e.currentTarget.dataset.id;
      if (filter === 'saved' && !api.requireLogin()) return;
      if (filter === 'nearby') {
        try {
          this.location = await model.location();
        } catch (err) {
          api.message(err);
          return;
        }
      }
      this.setData({ filter });
      this.load();
    },
    condition(e) {
      this.setData({ condition: e.currentTarget.dataset.id });
      this.load();
    },
    async load(more = false) {
      const serial = (this.serial = (this.serial || 0) + 1);
      const page = more ? this.data.page + 1 : 1;
      this.setData({ loading: true, error: '', offline: false, ...(!more ? { points: [] } : {}) });
      try {
        let result = await api.request('/api/points/search', 'POST', {
          query: this.data.query,
          filter: this.data.filter,
          condition: this.data.condition,
          page,
          pageSize: 30,
        });
        let points = result.points;
        if (this.data.filter === 'nearby' && this.location) {
          // Complete the candidate set before sorting, so pagination never puts a nearby place behind a far one.
          let next = page;
          while (result.hasMore) {
            result = await api.request('/api/points/search', 'POST', {
              query: this.data.query,
              filter: 'nearby',
              condition: this.data.condition,
              page: ++next,
              pageSize: 30,
            });
            if (serial !== this.serial) return;
            points.push(...result.points);
          }
          points = model.nearby(points, this.location);
        }
        if (serial !== this.serial) return;
        this.setData({
          points: [...(more ? this.data.points : []), ...points.map(model.pointView)],
          page,
          hasMore: result.hasMore,
        });
      } catch (error) {
        if (serial !== this.serial) return;
        const cached = !error.status
          ? require('../../services/public-offline').get('/api/catalog')
          : null;
        if (cached && this.data.filter === 'all' && !this.data.condition) {
          const query = this.data.query.trim().toLowerCase();
          this.setData({
            points: cached.points
              .filter((p) =>
                [p.name, p.description, p.theme].join(' ').toLowerCase().includes(query),
              )
              .map(model.pointView),
            offline: true,
            hasMore: false,
            error: '',
          });
        } else
          this.setData({
            error: cached
              ? '离线时仅支持公开资料关键词浏览；筛选与热门排行需要联网。'
              : error.message,
          });
      } finally {
        if (serial === this.serial) this.setData({ loading: false });
      }
    },
    open(e) {
      wx.navigateTo({
        url: '/pages/detail/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
    assistant() {
      wx.navigateTo({ url: '/pages/assistant/index' });
    },
    topics() {
      wx.navigateTo({ url: '/pages/topics/index' });
    },
    map() {
      wx.switchTab({ url: '/pages/map/index' });
    },
  }),
);
