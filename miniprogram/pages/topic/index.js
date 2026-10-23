const { activityView } = require('../../services/activity-view');
const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: { topic: null, error: '', subscribed: false },
    onLoad(o) {
      this.topicId = o.id;
    },
    onShow() {
      return this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
    },
    async load() {
      const serial = (this.serial = (this.serial || 0) + 1),
        owner = api.session()?.account.id;
      try {
        const r = await api.request('/api/topics');
        const t = r.items.find((x) => x.id === this.topicId);
        if (!t) throw Error('活动已下线或不存在');
        const reminders = api.session()
          ? await api.request('/api/my/topic-reminders')
          : { topicIds: [] };
        const catalog = await api.request('/api/catalog').catch(() => ({ points: [] }));
        if (serial !== this.serial || owner !== api.session()?.account.id || !this.nativeVisible)
          return;
        this.setData({
          error: '',
          topic: {
            ...activityView(t, catalog.points),
            stamps: t.stamps.map((s) => ({
              ...s,
              badge: api.asset('/shared/badges/' + (s.badgePreset || 'badge-01') + '.png', false),
            })),
          },
          subscribed: reminders.topicIds.includes(t.id),
        });
      } catch (e) {
        if (serial === this.serial) this.setData({ error: e.message });
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
      wx.navigateTo({
        url:
          '/pages/detail/index?id=' +
          e.currentTarget.dataset.id +
          '&activity=' +
          this.data.topic.id +
          '&entry=' +
          Date.now(),
      });
    },
    passport() {
      require('../../services/links').open('#passport');
    },
  }),
);
