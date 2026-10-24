const appearance = require('../../services/appearance');
const locale = require('../../services/localization');
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { administrator: Boolean },
  data: {
    open: false,
    saving: false,
    language: 'zh-CN',
    preference: 'system',
    signedIn: false,
    error: '',
  },
  lifetimes: {
    attached() {
      this.offLanguage = appearance.subscribe((data) =>
        this.setData({
          language: locale.resolved(data.preferences.language),
          preference: data.preferences.language,
        }),
      );
    },
    detached() {
      this.offLanguage?.();
    },
  },
  pageLifetimes: {
    hide() {
      this.setData({ open: false });
    },
  },
  methods: {
    toggle() {
      const client = require(
        this.properties.administrator ? '../../services/admin-api' : '../../services/api',
      );
      this.setData({ open: !this.data.open, signedIn: !!client.session(), error: '' });
    },
    close() {
      this.setData({ open: false });
    },
    async select(event) {
      if (this.data.saving) return;
      const language = event.currentTarget.dataset.language;
      if (!['system', 'zh-CN', 'en-US'].includes(language)) return;
      this.setData({ saving: true, error: '' });
      try {
        await appearance.update({ language }, this.properties.administrator);
        this.setData({ open: false });
      } catch (_) {
        this.setData({ error: locale.ui('设置未保存，请重试') });
      } finally {
        this.setData({ saving: false });
      }
    },
  },
});
