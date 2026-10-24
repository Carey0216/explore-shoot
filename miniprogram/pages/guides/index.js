const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
const scenes = [
  { id: 'all', name: '全部' },
  { id: 'newcomer', name: '新生入门' },
  { id: 'break', name: '课间15分钟' },
  { id: 'evening', name: '饭后散步' },
  { id: 'weekend', name: '周末慢拍' },
];
Page(
  pageOptions({
    data: {
      items: [],
      visible: [],
      guide: null,
      scenes,
      scene: 'all',
      loading: false,
      error: '',
      compose: false,
      question: '',
      budget: 30,
      preview: null,
      busy: false,
      planKeyboardHeight: 0,
    },
    onLoad(o) {
      this.id = o.id;
      this.setData({ compose: o.compose === '1' });
    },
    onShow() {
      this.load();
    },
    async load() {
      const owner = api.session()?.account.id;
      this.setData({ loading: true, error: '' });
      try {
        const r = await api.cached('/api/guides');
        if (!this.nativeVisible || owner !== api.session()?.account.id) return;
        const guide = this.id ? r.items.find((g) => g.id === this.id) : null;
        if (this.id && !guide) throw Error('指南已下线或不存在');
        this.setData({ items: r.items, visible: r.items, guide });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    filter(e) {
      const scene = e.currentTarget.dataset.id;
      this.setData({
        scene,
        visible: this.data.items.filter((g) => scene === 'all' || g.scene === scene),
      });
    },
    open(e) {
      wx.navigateTo({ url: '/pages/guides/index?id=' + e.currentTarget.dataset.id });
    },
    place(e) {
      require('../../services/links').open('#place/' + e.currentTarget.dataset.id);
    },
    compose() {
      this.setData({ compose: true });
    },
    closeCompose() {
      this.setData({ compose: false, planKeyboardHeight: 0 });
      wx.hideKeyboard();
    },
    noop() {},
    planKeyboard(e) {
      this.setData({ planKeyboardHeight: Math.max(0, Number(e.detail.height) || 0) });
    },
    field(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
    },
    async preview() {
      if (this.data.busy) return;
      this.setData({ busy: true, error: '', preview: null });
      try {
        const r = await api.request('/api/assistant/plan-preview', 'POST', {
          question: this.data.question || this.data.guide?.title || '校园拍摄',
          budget: Number(this.data.budget),
          ...(this.id ? { guideId: this.id } : {}),
        });
        if (this.nativeVisible) this.setData({ preview: r });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ busy: false });
      }
    },
    async save() {
      if (!api.requireLogin() || !this.data.preview?.canSave || this.data.busy) return;
      this.setData({ busy: true });
      try {
        const p = this.data.preview.plan;
        await api.request('/api/my/plans', 'POST', {
          title: p.title,
          items: p.items.map(({ id, spotId, composition, done, minutes }) => ({
            id,
            spotId,
            composition,
            done,
            minutes,
          })),
          departure: '',
          checklist: {},
        });
        wx.redirectTo({ url: '/pages/plans/index' });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ busy: false });
      }
    },
  }),
);
