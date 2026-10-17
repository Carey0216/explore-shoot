const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: { items: [], loading: false, error: '' },
    onShow() {
      this.load();
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const data = await api.request('/api/topics');
        this.setData({
          items: data.items.map((t) => ({
            ...t,
            phaseText: { active: '正在进行', upcoming: '即将开始', ended: '已结束' }[t.phase],
            time:
              new Date(t.startsAt).toLocaleDateString() +
              ' — ' +
              new Date(t.endsAt).toLocaleDateString(),
          })),
        });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    point(e) {
      wx.navigateTo({
        url: '/pages/detail/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
    passport() {
      wx.navigateTo({ url: '/pages/passport/index' });
    },
  }),
);
