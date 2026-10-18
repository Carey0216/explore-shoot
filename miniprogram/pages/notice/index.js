const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: { notice: null, error: '', loading: false },
    onLoad(o) {
      this.id = o.id;
    },
    async onShow() {
      if (!api.requireLogin()) return;
      this.setData({ loading: true });
      try {
        const n = await api.request('/api/notifications/' + encodeURIComponent(this.id));
        await api.request('/api/notifications/read', 'POST', { id: n.id });
        this.setData({ notice: n, error: '' });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    related() {
      require('../../services/links').open(this.data.notice.target);
    },
  }),
);
