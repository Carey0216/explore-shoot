const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { activityView } = require('../../services/activity-view');
Page(
  pageOptions({
    data: {
      items: [],
      visible: [],
      phase: 'all',
      query: '',
      phases: [
        { id: 'all', name: '全部' },
        { id: 'active', name: '正在进行' },
        { id: 'upcoming', name: '即将开始' },
        { id: 'ended', name: '已结束' },
      ],
      loading: false,
      error: '',
    },
    onShow() {
      this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
      this.setData({ items: [], visible: [], loading: false });
    },
    async load() {
      const serial = (this.serial = (this.serial || 0) + 1);
      this.setData({ loading: true, error: '' });
      try {
        const [data, catalog] = await Promise.all([
          api.request('/api/topics'),
          api.request('/api/catalog').catch(() => ({ points: [] })),
        ]);
        if (this.serial !== serial) return;
        this.setData({ items: data.items.map((t) => activityView(t, catalog.points)) });
        this.updateList();
      } catch (e) {
        if (this.serial === serial) this.setData({ error: e.message });
      } finally {
        if (this.serial === serial) this.setData({ loading: false });
      }
    },
    updateList() {
      const q = this.data.query.trim().toLowerCase();
      this.setData({
        visible: this.data.items.filter(
          (t) =>
            (this.data.phase === 'all' || t.phase === this.data.phase) &&
            `${t.title} ${t.description} ${t.themeText}`.toLowerCase().includes(q),
        ),
      });
    },
    search(e) {
      this.setData({ query: e.detail.value });
      this.updateList();
    },
    filter(e) {
      this.setData({ phase: e.currentTarget.dataset.id });
      this.updateList();
    },
    open(e) {
      wx.navigateTo({
        url: '/pages/topic/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
  }),
);
