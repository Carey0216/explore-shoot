const admin = require('../../services/admin-api'),
  api = require('../../services/api'),
  modules = require('../../services/admin-modules');
const types = {
  points: '校园点位',
  'shooting-spots': '真实机位',
  topics: '活动专题',
  guides: '拍摄指南',
};
Page(
  require('../../services/page').pageOptions(
    {
      data: {
        mode: 'preflight',
        loading: false,
        error: '',
        rows: [],
        checks: [],
        summary: null,
        preview: null,
        editor: null,
        config: null,
        testResult: '',
        busy: false,
        filter: 0,
        filters: ['待处理内容', '全部内容'],
        desktop: false,
        english: false,
      },
      onLoad(options) {
        this.mode = options.mode === 'weather' ? 'weather' : 'preflight';
        this.setData({ mode: this.mode });
      },
      onShow() {
        void this.load();
      },
      onHide() {
        this.serial = (this.serial || 0) + 1;
      },
      onUnload() {
        this.serial = (this.serial || 0) + 1;
      },
      async load(links = false) {
        if (typeof links !== 'boolean') links = false;
        const stamp = (this.serial = (this.serial || 0) + 1),
          owner = admin.session()?.account.id;
        this.setData({ loading: true, error: '' });
        try {
          const me = await admin.request('/auth/me');
          if (stamp !== this.serial || owner !== admin.session()?.account.id) return;
          if (!modules.can(me.account, this.mode)) throw Error('当前账号未获此功能授权');
          wx.setNavigationBarTitle({
            title: this.mode === 'weather' ? '校园天气设置' : '发布前预检',
          });
          if (this.mode === 'weather') {
            const config = await admin.request('/weather');
            if (this.nativeVisible && stamp === this.serial) this.setData({ config });
            return;
          }
          const result = await admin.request('/preflight' + (links ? '?links=1' : ''));
          while (links && result.nextLinkOffset != null) {
            if (stamp !== this.serial || !this.nativeVisible) return;
            const next = await admin.request('/preflight?links=1&offset=' + result.nextLinkOffset);
            result.linkChecks.push(...next.linkChecks);
            result.nextLinkOffset = next.nextLinkOffset;
          }
          if (stamp !== this.serial || !this.nativeVisible) return;
          this.result = result;
          this.draw();
        } catch (e) {
          if (stamp === this.serial) this.setData({ error: e.message });
        } finally {
          if (stamp === this.serial) this.setData({ loading: false });
        }
      },
      draw() {
        if (!this.result) return;
        const result = this.result;
        this.setData({
          summary: {
            ...result.summary,
            errors:
              result.issues.filter((i) => i.level === 'error').length +
              result.linkChecks.filter((c) => c.state === 'broken').length,
          },
          checks: result.linkChecks,
          rows: result.resources
            .map((r) => ({
              ...r,
              typeLabel: types[r.type],
              issues: result.issues.filter((i) => i.resource === r.key),
            }))
            .filter((r) => this.data.filter || r.issues.length),
        });
      },
      filter(e) {
        this.setData({ filter: Number(e.detail.value) });
        this.draw();
      },
      run() {
        void this.load(true);
      },
      preview(e) {
        this.setData({
          preview: this.result.resources.find((r) => r.key === e.currentTarget.dataset.key),
          desktop: false,
          english: false,
        });
      },
      close() {
        this.setData({ preview: null, editor: null });
      },
      noop() {},
      size() {
        this.setData({ desktop: !this.data.desktop });
      },
      language() {
        this.setData({ english: !this.data.english });
      },
      edit(e) {
        const r = this.result.resources.find((r) => r.key === e.currentTarget.dataset.key);
        if (r.editable)
          this.setData({
            editor: {
              ...r,
              english: { title: r.english?.title || '', body: r.english?.body || '' },
            },
          });
      },
      field(e) {
        const key = e.currentTarget.dataset.key;
        this.setData({
          [this.data.mode === 'weather' ? 'config.' + key : 'editor.english.' + key]:
            e.detail.value,
        });
      },
      async save() {
        if (this.data.busy) return;
        const stamp = this.serial;
        this.setData({ busy: true, error: '' });
        try {
          if (this.mode === 'weather') {
            const c = this.data.config;
            const saved = await admin.request('/weather', 'PUT', {
              revision: c.revision,
              label: c.label,
              latitude: Number(c.latitude),
              longitude: Number(c.longitude),
              refreshMinutes: Number(c.refreshMinutes),
            });
            if (stamp === this.serial) this.setData({ config: saved });
          } else {
            const r = this.data.editor;
            await admin.request('/preflight/english', 'PUT', {
              type: r.type,
              id: r.id,
              revision: r.revision,
              title: r.english.title,
              body: r.english.body,
            });
            if (stamp === this.serial) {
              this.close();
              void this.load();
            }
          }
          api.message('已保存');
        } catch (e) {
          if (stamp === this.serial) this.setData({ error: e.message });
        } finally {
          if (stamp === this.serial) this.setData({ busy: false });
        }
      },
      async test() {
        const stamp = this.serial;
        this.setData({ testResult: '正在检查天气接口…' });
        try {
          const d = await admin.request('/weather/preview');
          if (stamp === this.serial)
            this.setData({
              testResult: d.available
                ? d.label +
                  ' · ' +
                  Math.round(d.temperature) +
                  '° / ' +
                  Math.round(d.high) +
                  '° / ' +
                  Math.round(d.low) +
                  '° · Open-Meteo'
                : d.message,
            });
        } catch (e) {
          if (stamp === this.serial) this.setData({ testResult: e.message });
        }
      },
      back() {
        wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/admin-console/index' }) });
      },
    },
    { administrator: true },
  ),
);
