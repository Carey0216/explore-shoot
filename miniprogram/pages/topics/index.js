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
        const reminders = api.session()
          ? await api.request('/api/my/topic-reminders')
          : { topicIds: [] };
        this.setData({
          items: data.items.map((t) => ({
            ...t,
            subscribed: reminders.topicIds.includes(t.id),
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
    async remind(e) {
      if (!api.requireLogin()) return;
      const id = e.currentTarget.dataset.id,
        t = this.data.items.find((t) => t.id === id);
      try {
        await api.request('/api/my/topic-reminders', 'POST', {
          topicId: id,
          enabled: !t.subscribed,
        });
        await this.load();
        api.message(!t.subscribed ? '已订阅，联网时在消息中心提醒' : '已取消提醒');
      } catch (e) {
        api.message(e);
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
