const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: { topic: null, error: '' },
    async onLoad(o) {
      try {
        const r = await api.request('/api/topics');
        const t = r.items.find((x) => x.id === o.id);
        if (!t) throw Error('活动已下线或不存在');
        this.setData({ topic: t });
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    place(e) {
      require('../../services/links').open('#place/' + e.currentTarget.dataset.id);
    },
    passport() {
      require('../../services/links').open('#passport');
    },
  }),
);
