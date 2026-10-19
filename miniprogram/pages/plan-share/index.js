const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: { plan: null, loading: false, error: '', busy: false },
    onLoad(o) {
      this.token = o.id || '';
      this.submissionId = require('../../services/model').uuid();
      this.load();
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const plan = await api.request('/api/plan-shares/' + encodeURIComponent(this.token));
        this.setData({ plan });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    async importPlan() {
      if (!api.requireLogin() || this.data.busy) return;
      this.setData({ busy: true });
      try {
        await api.request('/api/plan-shares/' + this.token + '/import', 'POST', {
          submissionId: this.submissionId,
        });
        wx.redirectTo({ url: '/pages/plans/index' });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    open(e) {
      require('../../services/links').open('#spot/' + e.currentTarget.dataset.id);
    },
    onShareAppMessage() {
      return {
        title: this.data.plan?.title || '校园拍摄计划',
        path: '/pages/plan-share/index?id=' + this.token,
      };
    },
  }),
);
