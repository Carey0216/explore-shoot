const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { pointView } = require('../../services/model');
Page(
  pageOptions({
    data: { points: [], themes: [], loading: false, error: '' },
    onLoad() {
      this.load();
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const result = await api.request('/api/catalog');
        const byId = new Map(result.points.map((p) => [p.id, p]));
        this.setData({
          points: result.popularPointIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .slice(0, 12)
            .map(pointView),
          themes: [...new Set(result.points.map((p) => p.theme).filter(Boolean))],
        });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
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
