const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: { remaining: 0, paper: null, answers: {}, loading: false, error: '', reason: '' },
    async onShow() {
      if (!api.requireLogin()) return;
      try {
        const me = await api.request('/api/auth/me');
        api.updateAccount(me.account);
        if (me.account.scoutStatus === 'approved') {
          wx.redirectTo({ url: '/pages/publish/index' });
          return;
        }
        const status = await api.request('/api/scout/quiz');
        this.setData({ remaining: status.remaining });
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    async start() {
      if (this.data.loading) return;
      this.setData({ loading: true, error: '' });
      try {
        const paper = await api.request('/api/scout/quiz/start', 'POST', {});
        this.setData({ paper, answers: {}, remaining: paper.remaining });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    answer(e) {
      this.setData({ ['answers.' + e.currentTarget.dataset.id]: Number(e.detail.value) });
    },
    reason(e) {
      this.setData({ reason: e.detail.value });
    },
    async apply() {
      try {
        await api.request('/api/scout/apply', 'POST', { reason: this.data.reason });
        wx.showToast({ title: '申请已送达', icon: 'success' });
        wx.switchTab({ url: '/pages/my/index' });
      } catch (e) {
        api.message(e);
      }
    },
    async submit() {
      if (this.data.loading) return;
      this.setData({ loading: true, error: '' });
      try {
        const result = await api.request('/api/scout/quiz/submit', 'POST', {
          id: this.data.paper.id,
          answers: this.data.answers,
        });
        this.setData({ paper: null, remaining: result.remaining });
        if (result.passed) {
          api.updateAccount((await api.request('/api/auth/me')).account);
          wx.showToast({ title: '已解锁探索官', icon: 'success' });
          wx.redirectTo({ url: '/pages/publish/index' });
        } else
          this.setData({ error: `答对${result.score}题，未通过。剩余${result.remaining}次机会。` });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
  }),
);
