const { pageOptions } = require('../../services/page'),
  api = require('../../services/api');
Page(
  pageOptions({
    data: {
      mode: 'list',
      albums: [],
      candidates: [],
      selectedRows: [],
      selectedCount: 0,
      album: null,
      form: { title: '一学期的校园', theme: 'semester', message: '' },
      themeIndex: 0,
      themes: ['一学期的校园', '毕业回忆', '我的校园故事'],
      more: false,
      loading: false,
      busy: false,
      error: '',
      exportProgress: '',
      deleteConfirm: false,
    },
    photoPreview(e) {
      return require('../../services/photo-viewer').preview(
        this.data.album.items.filter((i) => i.available).map((i) => i.photo),
        e.currentTarget.dataset.photo,
      );
    },
    onShow() {
      if (this.exportComplete) {
        this.exportComplete = false;
        this.setData({ busy: false, exportProgress: '' });
      }
      const identity = api.identity();
      if (this.owner !== identity) {
        this.owner = identity;
        this.selected = new Map();
        this.setData({ mode: 'list', selectedRows: [], selectedCount: 0, album: null });
        this.load();
      } else if (this.data.mode === 'list') this.load();
    },
    login() {
      api.requireLogin();
    },
    albumView(album) {
      return {
        ...album,
        items: album.items.map((i) => ({
          ...i,
          dateLabel: require('../../services/album-export-core').date(i.date),
        })),
      };
    },
    async load() {
      if (!api.session()) return;
      const owner = api.identity();
      this.setData({ loading: true, error: '' });
      try {
        const data = await api.request('/api/my/memories');
        if (this.nativeVisible && owner === api.identity()) this.setData({ albums: data.items });
      } catch (e) {
        if (this.nativeVisible) this.setData({ error: e.message });
      } finally {
        if (this.nativeVisible) this.setData({ loading: false });
      }
    },
    newAlbum() {
      this.editAlbum(null);
    },
    edit() {
      this.editAlbum(this.data.album);
    },
    async editAlbum(album) {
      this.selected = new Map((album?.items || []).map((i) => [i.mediaId, { ...i }]));
      this.current = album;
      this.choicePage = 1;
      this.setData({
        mode: 'edit',
        form: {
          title: album?.title || '一学期的校园',
          theme: album?.theme || 'semester',
          message: album?.message || '',
        },
        themeIndex: ['semester', 'graduation', 'custom'].indexOf(album?.theme || 'semester'),
        candidates: [],
        error: '',
      });
      this.syncSelection();
      await this.choices(false);
    },
    async choices(more) {
      if (this.data.loading) return;
      const owner = api.identity();
      this.setData({ loading: true, error: '' });
      if (more) this.choicePage++;
      try {
        const data = await api.request('/api/my/memories/candidates?page=' + this.choicePage);
        if (!this.nativeVisible || owner !== api.identity() || this.data.mode !== 'edit') return;
        this.setData({
          candidates: [...(more ? this.data.candidates : []), ...data.items],
          more: data.hasMore,
        });
        this.syncSelection();
      } catch (e) {
        if (more) this.choicePage--;
        if (this.nativeVisible) this.setData({ error: e.message });
      } finally {
        if (this.nativeVisible) this.setData({ loading: false });
      }
    },
    morePhotos() {
      this.choices(true);
    },
    syncSelection() {
      this.setData({
        selectedRows: [...this.selected.values()],
        selectedCount: this.selected.size,
        candidates: this.data.candidates.map((i) => ({
          ...i,
          selected: this.selected.has(i.mediaId),
        })),
      });
    },
    choose(e) {
      const id = e.currentTarget.dataset.id;
      if (this.selected.has(id)) this.selected.delete(id);
      else {
        if (this.selected.size >= 24) return api.message(Error('每本最多24张照片'));
        const item = this.data.candidates.find((i) => i.mediaId === id);
        if (item) this.selected.set(id, { ...item, caption: '' });
      }
      this.syncSelection();
    },
    remove(e) {
      this.selected.delete(e.currentTarget.dataset.id);
      this.syncSelection();
    },
    move(e) {
      const entries = [...this.selected.entries()],
        index = entries.findIndex(([id]) => id === e.currentTarget.dataset.id);
      if (index > 0) [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]];
      this.selected = new Map(entries);
      this.syncSelection();
    },
    caption(e) {
      const item = this.selected.get(e.currentTarget.dataset.id);
      if (item) item.caption = e.detail.value;
    },
    field(e) {
      const key = e.currentTarget.dataset.field;
      if (['title', 'message'].includes(key)) this.setData({ ['form.' + key]: e.detail.value });
    },
    theme(e) {
      const index = Number(e.detail.value),
        theme = ['semester', 'graduation', 'custom'][index];
      if (!theme) return;
      const form = { ...this.data.form, theme };
      if (this.data.themes.includes(form.title)) form.title = this.data.themes[index];
      this.setData({ form, themeIndex: index });
    },
    async save() {
      if (this.data.busy) return;
      if (!this.selected.size) return api.message(Error('请主动选择至少一张照片'));
      const owner = api.identity(),
        body = {
          ...this.data.form,
          items: [...this.selected.values()].map(({ mediaId, caption }) => ({ mediaId, caption })),
        };
      if (this.current) body.revision = this.current.revision;
      this.setData({ busy: true, error: '' });
      try {
        const album = await api.request(
          '/api/my/memories' + (this.current ? '/' + this.current.id : ''),
          this.current ? 'PUT' : 'POST',
          body,
        );
        if (this.nativeVisible && owner === api.identity())
          this.setData({ mode: 'view', album: this.albumView(album) });
      } catch (e) {
        if (this.nativeVisible) this.setData({ error: e.message });
      } finally {
        if (this.nativeVisible) this.setData({ busy: false });
      }
    },
    async open(e) {
      this.setData({ loading: true, error: '' });
      const owner = api.identity();
      try {
        const album = await api.request('/api/my/memories/' + e.currentTarget.dataset.id);
        if (this.nativeVisible && owner === api.identity())
          this.setData({ mode: 'view', album: this.albumView(album) });
      } catch (e) {
        api.message(e);
      } finally {
        if (this.nativeVisible) this.setData({ loading: false });
      }
    },
    list() {
      if (this.data.busy) return;
      this.setData({ mode: 'list', error: '', exportProgress: '' });
      this.load();
    },
    askDelete() {
      this.setData({ deleteConfirm: true });
    },
    closeDelete() {
      this.setData({ deleteConfirm: false });
    },
    noop() {},
    async deleteAlbum() {
      if (this.data.busy) return;
      this.setData({ busy: true });
      try {
        await api.request('/api/my/memories/' + this.data.album.id, 'DELETE', {
          revision: this.data.album.revision,
        });
        if (this.nativeVisible) {
          this.setData({ deleteConfirm: false, busy: false });
          this.list();
        }
      } catch (e) {
        api.message(e);
      } finally {
        if (this.nativeVisible) this.setData({ busy: false });
      }
    },
    async export(e) {
      if (this.data.busy) return;
      this.setData({ busy: true, error: '', exportProgress: '正在准备照片…' });
      const owner = api.identity();
      try {
        const album = await api.request('/api/my/memories/' + this.data.album.id);
        if (!this.nativeVisible || owner !== api.identity()) return;
        await require('../../services/memory-export').exportAlbum(
          this,
          album,
          e.currentTarget.dataset.format,
          (done, total) => {
            if (this.nativeVisible)
              this.setData({ exportProgress: `正在整理 ${done} / ${total} 张照片…` });
          },
        );
      } catch (error) {
        if (this.nativeVisible) this.setData({ error: error.message || '导出未完成，请重试' });
      } finally {
        if (owner === api.identity()) {
          if (this.nativeVisible) this.setData({ busy: false, exportProgress: '' });
          else this.exportComplete = true;
        }
      }
    },
  }),
);
