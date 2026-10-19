const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: { topic: null, error: '', subscribed: false },
    async onLoad(o) {
      try {
        const r = await api.request('/api/topics');
        const t = r.items.find((x) => x.id === o.id);
        if (!t) throw Error('活动已下线或不存在');
        const reminders = api.session()
          ? await api.request('/api/my/topic-reminders')
          : { topicIds: [] };
        this.setData({ topic: t, subscribed: reminders.topicIds.includes(t.id) });
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    async remind() {
      if (!api.requireLogin()) return;
      try {
        await api.request('/api/my/topic-reminders', 'POST', {
          topicId: this.data.topic.id,
          enabled: !this.data.subscribed,
        });
        this.setData({ subscribed: !this.data.subscribed });
        api.message(this.data.subscribed ? '已订阅，联网时在消息中心提醒' : '已取消提醒');
      } catch (e) {
        api.message(e);
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
