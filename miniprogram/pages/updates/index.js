const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: { items: [], loading: false, error: '' },
    onShow() {
      this.load();
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const r = await api.request('/api/updates');
        if (this.nativeVisible) this.setData({ items: r.items });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    open(e) {
      require('../../services/links').open(e.currentTarget.dataset.path);
    },
    tour() {
      this.selectComponent('#experience')?.replay();
    },
  }),
);
