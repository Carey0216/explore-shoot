const admin = require('../../services/admin-api');
const scope = () =>
  require('../../services/network').configuredOrigin() +
  ':' +
  (admin.session()?.account.id || 'guest');
Page(
  require('../../services/page').pageOptions(
    {
      data: {
        loading: false,
        error: '',
        tasks: [],
        topics: [],
        reminders: [],
        selected: {},
        actions: ['立即展示', '下架', '定时上下架', '统一修改介绍'],
        action: 0,
        description: '',
        publishAt: '',
        unpublishAt: '',
        preview: null,
        busy: false,
      },
      onShow() {
        void this.load();
      },
      async load() {
        if (!admin.session()) return wx.redirectTo({ url: '/pages/admin/index' });
        const owner = scope(),
          run = (this.loadRun = (this.loadRun || 0) + 1);
        this.reviewRun = (this.reviewRun || 0) + 1;
        this.formRevision = (this.formRevision || 0) + 1;
        this.pendingBody = null;
        this.setData({ loading: true, error: '', preview: null, busy: false });
        try {
          const data = await admin.request('/task-workbench');
          if (this.nativeVisible && run === this.loadRun && owner === scope())
            this.setData({ ...data, selected: {}, preview: null });
        } catch (e) {
          if (this.nativeVisible && run === this.loadRun && owner === scope())
            this.setData({ error: e.message });
        } finally {
          if (this.nativeVisible && run === this.loadRun && owner === scope())
            this.setData({ loading: false });
        }
      },
      open(e) {
        const name = e.currentTarget.dataset.route;
        if (name === 'task-workbench')
          return wx.pageScrollTo({ selector: '#topic-schedule820', duration: 250 });
        if (name === 'preflight') return wx.navigateTo({ url: '/pages/preflight/index' });
        if (['inbox', 'messages'].includes(name))
          return wx.navigateTo({ url: '/pages/admin/index?tab=' + name });
        wx.navigateTo({
          url:
            '/pages/admin-console/index?module=' +
            encodeURIComponent(name === 'passport' ? 'buildings' : name),
        });
      },
      select(e) {
        this.formRevision = (this.formRevision || 0) + 1;
        this.pendingBody = null;
        const id = e.currentTarget.dataset.id;
        this.setData({ ['selected.' + id]: !this.data.selected[id], preview: null });
      },
      action(e) {
        this.formRevision = (this.formRevision || 0) + 1;
        this.pendingBody = null;
        this.setData({ action: Number(e.detail.value), preview: null });
      },
      field(e) {
        this.formRevision = (this.formRevision || 0) + 1;
        this.pendingBody = null;
        this.setData({ [e.currentTarget.dataset.key]: e.detail.value, preview: null });
      },
      noop() {},
      close() {
        this.formRevision = (this.formRevision || 0) + 1;
        this.pendingBody = null;
        this.setData({ preview: null });
      },
      async review() {
        if (this.data.busy) return;
        const owner = scope(),
          revision = this.formRevision || 0,
          run = (this.reviewRun = (this.reviewRun || 0) + 1);
        this.setData({ busy: true, error: '' });
        try {
          const body = {
            items: this.data.topics
              .filter((r) => this.data.selected[r.id])
              .map((r) => ({ id: r.id, revision: r.revision })),
            action: ['publish', 'unpublish', 'schedule', 'description'][this.data.action],
          };
          if (body.action === 'description') body.description = this.data.description;
          if (body.action === 'schedule')
            for (const k of ['publishAt', 'unpublishAt']) {
              const value = this.data[k];
              if (value && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value))
                throw Error('请按YYYY-MM-DD HH:mm填写四位年份的本机时间');
              body[k] = value ? new Date(value.replace(' ', 'T')).toISOString() : '';
            }
          const preview = await admin.request('/task-workbench/topic-batch/preview', 'POST', body);
          if (
            !this.nativeVisible ||
            owner !== scope() ||
            run !== this.reviewRun ||
            revision !== (this.formRevision || 0)
          )
            return;
          this.pendingBody = body;
          if (this.nativeVisible)
            this.setData({
              preview: {
                ...preview,
                changes: preview.changes.map((r) => ({
                  ...r,
                  fields: Object.keys(r.after)
                    .filter((k) => r.before[k] !== r.after[k])
                    .map((k) => ({
                      name: {
                        published: '展示状态',
                        publishAt: '上架时间',
                        unpublishAt: '下架时间',
                        description: '介绍',
                      }[k],
                      before: String(r.before[k]),
                      after: String(r.after[k]),
                    })),
                })),
              },
            });
        } catch (e) {
          if (this.nativeVisible && owner === scope() && revision === (this.formRevision || 0))
            this.setData({ error: e.message });
        } finally {
          if (this.nativeVisible && owner === scope() && run === this.reviewRun)
            this.setData({ busy: false });
        }
      },
      async apply() {
        if (this.data.busy || !this.data.preview || !this.pendingBody) return;
        const owner = scope();
        this.setData({ busy: true });
        try {
          await admin.request('/task-workbench/topic-batch/apply', 'POST', {
            ...this.pendingBody,
            confirmation: this.data.preview.confirmation,
          });
          if (this.nativeVisible && owner === scope()) {
            wx.showToast({ title: '已保存并备份', icon: 'success' });
            await this.load();
          }
        } catch (e) {
          if (this.nativeVisible && owner === scope())
            this.setData({ error: e.message, preview: null });
        } finally {
          if (this.nativeVisible && owner === scope()) this.setData({ busy: false });
        }
      },
      onUnload() {
        this.loadRun = (this.loadRun || 0) + 1;
        this.reviewRun = (this.reviewRun || 0) + 1;
        this.formRevision = (this.formRevision || 0) + 1;
        this.pendingBody = null;
      },
    },
    { administrator: true },
  ),
);
