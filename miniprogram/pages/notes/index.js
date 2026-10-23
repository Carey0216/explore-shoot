const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      items: [],
      record: null,
      page: 0,
      hasMore: false,
      query: '',
      feedback: '',
      rating: 0,
      loading: false,
      error: '',
    },
    onLoad(o) {
      this.id = o.id || '';
    },
    onShow() {
      if (api.requireLogin()) this.load();
    },
    field(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
    },
    async load(more = false) {
      if (typeof more !== 'boolean') more = false;
      const owner = api.session()?.account.id;
      this.setData({ loading: true, error: '' });
      try {
        if (this.id) {
          const r = await api.request('/api/sessions/' + this.id);
          if (owner === api.session()?.account.id)
            this.setData({
              record: {
                ...(r.session || r),
                tasks: (r.session || r).tasks.map((t) => ({
                  ...t,
                  photo: t.mediaId ? '/media/' + t.mediaId : '',
                })),
              },
              feedback: (r.session || r).feedback || '',
              rating: (r.session || r).rating || 0,
            });
        } else {
          const page = more ? this.data.page + 1 : 1,
            r = await api.request(
              '/api/my/notes?query=' + encodeURIComponent(this.data.query) + '&page=' + page,
            );
          if (owner === api.session()?.account.id)
            this.setData({
              items: [...(more ? this.data.items : []), ...r.items],
              page,
              hasMore: r.hasMore,
            });
        }
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    open(e) {
      wx.navigateTo({ url: '/pages/notes/index?id=' + e.currentTarget.dataset.id });
    },
    more() {
      if (this.data.hasMore && !this.data.loading) this.load(true);
    },
    async save() {
      try {
        await api.request('/api/sessions/' + this.id, 'PATCH', {
          action: 'feedback',
          feedback: this.data.feedback,
          rating: Number(this.data.rating),
        });
        api.message('感受已保存，仅自己可见');
      } catch (e) {
        api.message(e);
      }
    },
    async remove() {
      const r = await new Promise((resolve) =>
        wx.showModal({
          title: '删除这篇私人手记？',
          content: '相关任务照片会按现有删除规则清理，删除后无法从客户端恢复。',
          confirmText: '确认删除',
          success: resolve,
        }),
      );
      if (!r.confirm) return;
      try {
        await api.request('/api/sessions/' + this.id, 'DELETE', {});
        wx.navigateBack();
      } catch (e) {
        api.message(e);
      }
    },
    async preview(e) {
      try {
        const path = await api.download(e.currentTarget.dataset.path, false);
        wx.previewImage({ urls: [path] });
      } catch (e) {
        api.message(e);
      }
    },
    async exportNote() {
      if (this.exporting) return;
      this.exporting = true;
      const identity = api.identity();
      let path;
      try {
        const text = await api.request('/api/sessions/' + this.id + '/export');
        if (identity !== api.identity() || !this.nativeVisible) return;
        if (!wx.shareFileMessage)
          return api.message('当前微信版本不支持分享文件，请升级微信后重试');
        path =
          wx.env.USER_DATA_PATH +
          '/explore-note-' +
          Date.now() +
          '-' +
          Math.random().toString(36).slice(2) +
          '.html';
        api.registerFile(path);
        await new Promise((resolve, reject) =>
          wx.getFileSystemManager().writeFile({
            filePath: path,
            data: typeof text === 'string' ? text : JSON.stringify(text),
            encoding: 'utf8',
            success: resolve,
            fail: reject,
          }),
        );
        if (identity !== api.identity() || !this.nativeVisible) return;
        await new Promise((resolve) =>
          wx.shareFileMessage({ filePath: path, fileName: '校园探索手记.html', complete: resolve }),
        );
      } catch (e) {
        if (identity === api.identity()) api.message(e);
      } finally {
        if (path) api.forgetFile(path);
        this.exporting = false;
      }
    },
  }),
);
