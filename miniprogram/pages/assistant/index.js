const api = require('../../services/api');
const { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      question: '',
      generate: false,
      available: false,
      loading: false,
      error: '',
      answer: null,
    },
    onLoad() {
      this.active = true;
      api
        .request('/api/assistant/capabilities')
        .then((status) => {
          if (this.active) this.setData({ available: status.generationAvailable });
        })
        .catch(() => {});
    },
    onUnload() {
      this.active = false;
    },
    question(event) {
      this.setData({ question: event.detail.value });
    },
    generate(event) {
      this.setData({ generate: event.detail.value });
    },
    async search() {
      if (this.data.loading) return;
      this.setData({ loading: true, error: '', answer: null });
      try {
        const answer = await api.request('/api/assistant/query', 'POST', {
          question: this.data.question,
          generate: this.data.generate && this.data.available,
        });
        if (this.active) this.setData({ answer });
      } catch (error) {
        if (this.active) this.setData({ error: error.message });
      } finally {
        if (this.active) this.setData({ loading: false });
      }
    },
    open(event) {
      wx.navigateTo({
        url: '/pages/detail/index?id=' + encodeURIComponent(event.currentTarget.dataset.id),
      });
    },
  }),
);
