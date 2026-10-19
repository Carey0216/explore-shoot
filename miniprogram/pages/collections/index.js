const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      items: [],
      points: [],
      editing: false,
      title: '',
      selected: [],
      busy: false,
      error: '',
    },
    onShow() {
      if (api.requireLogin()) this.load();
    },
    async load() {
      try {
        const [g, me, catalog] = await Promise.all([
          api.request('/api/my/collections'),
          api.request('/api/auth/me'),
          api.request('/api/catalog'),
        ]);
        const byId = new Map(catalog.points.map((p) => [p.id, p]));
        this.setData({
          items: g.items.map((g) => ({
            ...g,
            names: g.pointIds.map((id) => byId.get(id)?.name || '地点已下线').join('、'),
            points: g.pointIds.map((id) => ({ id, name: byId.get(id)?.name || '地点已下线' })),
          })),
          points: catalog.points.filter((p) => me.account.bookmarks?.includes(p.id)),
          error: '',
        });
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    edit(e) {
      const g = this.data.items.find((g) => g.id === e.currentTarget.dataset.id);
      this.group = g || null;
      this.setData({
        editing: true,
        title: g?.title || '',
        selected: g?.pointIds || [],
        points: this.data.points.map((p) => ({ ...p, checked: !!g?.pointIds.includes(p.id) })),
      });
    },
    title(e) {
      this.setData({ title: e.detail.value });
    },
    select(e) {
      this.setData({ selected: e.detail.value });
    },
    cancel() {
      this.setData({ editing: false });
    },
    async save() {
      if (this.data.busy) return;
      this.setData({ busy: true });
      try {
        const g = this.group;
        await api.request('/api/my/collections' + (g ? '/' + g.id : ''), g ? 'PUT' : 'POST', {
          title: this.data.title,
          pointIds: this.data.selected,
          ...(g ? { revision: g.revision } : {}),
        });
        this.setData({ editing: false });
        await this.load();
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    async remove() {
      if (!this.group || this.data.busy) return;
      const r = await new Promise((resolve) =>
        wx.showModal({
          title: '删除这个分组？',
          content: '地点收藏和拍摄清单仍会保留。',
          success: resolve,
        }),
      );
      if (!r.confirm) return;
      try {
        await api.request('/api/my/collections/' + this.group.id, 'DELETE', {
          revision: this.group.revision,
        });
        this.setData({ editing: false });
        await this.load();
      } catch (e) {
        api.message(e);
      }
    },
    open(e) {
      require('../../services/links').open('#place/' + e.currentTarget.dataset.id);
    },
  }),
);
