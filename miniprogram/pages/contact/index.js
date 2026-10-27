const api = require('../../services/api'),
  photo = require('../../services/photo'),
  model = require('../../services/model'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      threads: [],
      requests: [],
      items: [],
      body: '',
      linkLabel: '',
      linkHref: '',
      imageId: '',
      image: '',
      conversation: null,
      loading: false,
      error: '',
    },
    onLoad(o) {
      this.thread = o.thread;
      this.submission = model.uuid();
    },
    onShow() {
      if (api.requireLogin()) this.load();
    },
    field(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        if (this.thread) {
          const r = await api.request('/api/conversations/' + this.thread);
          await api.request('/api/conversations/' + this.thread + '/read', 'POST', {});
          this.setData({
            conversation: r.conversation,
            items: r.items.map((x) => ({ ...x, time: model.shortTime(x.createdAt) })),
            next: r.next,
          });
        } else {
          const [r, t] = await Promise.all([
            api.request('/api/contact-requests'),
            api.request('/api/conversations'),
          ]);
          this.setData({ requests: r.items, threads: t.items });
        }
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    open(e) {
      wx.navigateTo({ url: '/pages/contact/index?thread=' + e.currentTarget.dataset.id });
    },
    async older() {
      try {
        const r = await api.request(
          '/api/conversations/' + this.thread + '?before=' + encodeURIComponent(this.data.next),
        );
        this.setData({
          items: [
            ...r.items.map((x) => ({ ...x, time: model.shortTime(x.createdAt) })),
            ...this.data.items,
          ],
          next: r.next,
        });
      } catch (e) {
        api.message(e);
      }
    },
    async choose() {
      try {
        const serial = (this.photoSerial = (this.photoSerial || 0) + 1),
          owner = api.session()?.account.id,
          p = await photo.choose(),
          canvas = await new Promise((resolve) =>
            wx
              .createSelectorQuery()
              .in(this)
              .select('#message-photo')
              .fields({ node: true })
              .exec((r) => resolve(r[0]?.node)),
          );
        const compressed = await photo.compress(p, canvas);
        if (api.session()?.account.id !== owner || serial !== this.photoSerial) return;
        this.setData({ loading: true });
        const m = await api.request('/api/media', 'POST', {
          photo: await photo.dataURL(compressed),
        });
        if (api.session()?.account.id === owner && serial === this.photoSerial)
          this.setData({ image: compressed, imageId: m.id });
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) api.message(e);
      } finally {
        this.setData({ loading: false });
      }
    },
    removeImage() {
      this.photoSerial = (this.photoSerial || 0) + 1;
      this.setData({ image: '', imageId: '' });
    },
    async send() {
      if (this.data.loading) return;
      this.setData({ loading: true, error: '' });
      try {
        if (this.thread) {
          const links = this.data.linkHref
            ? [{ label: this.data.linkLabel, href: this.data.linkHref }]
            : [];
          await api.request('/api/conversations/' + this.thread + '/messages', 'POST', {
            body: this.data.body,
            imageId: this.data.imageId,
            links,
            submissionId: this.submission,
            fileIds: this.selectComponent('#message-files')?.ids() || [],
          });
          this.submission = model.uuid();
          this.selectComponent('#message-files')?.clear();
        } else await api.request('/api/contact-requests', 'POST', { body: this.data.body });
        this.setData({ body: '', imageId: '', image: '', linkLabel: '', linkHref: '' });
        await this.load();
        wx.showToast({ title: this.thread ? '消息已发送' : '留言已送达', icon: 'success' });
      } catch (e) {
        this.setData({ error: e.message + '；输入已保留，可重试。' });
      } finally {
        this.setData({ loading: false });
      }
    },
  }),
);
