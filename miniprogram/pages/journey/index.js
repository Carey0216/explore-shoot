const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      items: [],
      session: null,
      budget: 20,
      people: 1,
      intensity: '轻松',
      theme: '全部',
      mode: 'fixed',
      query: '',
      loading: false,
      busy: false,
      error: '',
      feedback: '',
      reason: '',
      recording: false,
      trackError: '',
    },
    onLoad(o) {
      this.id = o.id;
    },
    onShow() {
      this.load();
    },
    onHide() {
      clearTimeout(this.tick);
      this.stopRecording();
    },
    onUnload() {
      clearTimeout(this.tick);
      this.stopRecording();
    },
    intensityPick(e) {
      this.setData({ intensity: ['轻松', '适中'][Number(e.detail.value)] });
    },
    pick(e) {
      const k = e.currentTarget.dataset.key;
      const choices = {
        budget: [15, 20, 30],
        people: [1, 2],
        theme: ['全部', '建筑', '自然', '人文', '运动'],
        mode: ['guide', 'fixed', 'personal'],
      };
      this.setData({ [k]: choices[k][Number(e.detail.value)] });
    },
    field(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
    },
    budget(e) {
      this.setData({ budget: Number(e.detail.value) });
    },
    async load() {
      const owner = api.session()?.account.id;
      this.setData({ loading: true, error: '' });
      try {
        if (this.id) {
          const r = await api.request('/api/sessions/' + this.id);
          if (owner === api.session()?.account.id) this.accept(r.session || r);
        } else {
          const data = await api.request('/api/plan', 'POST', this.preferences());
          if (this.nativeVisible)
            this.setData({ items: Array.isArray(data) ? data : data.items || [] });
        }
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    preferences() {
      return {
        budget: Number(this.data.budget),
        people: Number(this.data.people),
        intensity: this.data.intensity,
        theme: this.data.theme,
        mode: this.data.mode,
        query: this.data.query,
      };
    },
    async start(e) {
      if (!api.requireLogin() || this.data.busy) return;
      this.setData({ busy: true, error: '' });
      try {
        const p = this.preferences();
        delete p.query;
        const r = await api.request('/api/sessions', 'POST', {
          routeId: e.currentTarget.dataset.id,
          preferences: p,
        });
        const s = r.session || r;
        wx.navigateTo({ url: '/pages/journey/index?id=' + s.id });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ busy: false });
      }
    },
    async action(e) {
      if (this.data.busy) return;
      const action = e.currentTarget.dataset.action,
        id = e.currentTarget.dataset.id;
      let body = { action };
      if (action === 'task') {
        body = {
          action,
          taskId: id,
          status: e.currentTarget.dataset.status,
          reason: this.data.reason,
        };
        if (body.status === 'skipped' && !body.reason) return api.message('请填写跳过原因');
      }
      if (action === 'feedback') body = { action, feedback: this.data.feedback, rating: 0 };
      this.setData({ busy: true, error: '' });
      try {
        const r = await api.request('/api/sessions/' + this.id, 'PATCH', body);
        this.accept(r.session || r);
        if (['finish', 'exit'].includes(action))
          wx.redirectTo({ url: '/pages/notes/index?id=' + this.id });
        else await this.load();
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ busy: false });
      }
    },
    place(e) {
      require('../../services/links').open('#place/' + e.currentTarget.dataset.id);
    },
    checkin(e) {
      wx.navigateTo({ url: '/pages/checkin/index?point=' + e.currentTarget.dataset.id });
    },
    navigate(e) {
      getApp().globalData.destination = e.currentTarget.dataset.id;
      getApp().globalData.mapTab = 'navigation';
      wx.switchTab({ url: '/pages/map/index' });
    },
    accept(session) {
      this.setData({
        session: {
          ...session,
          tasks: session.tasks.map((t) => ({
            ...t,
            photo: t.mediaId ? '/media/' + t.mediaId : '',
          })),
        },
        feedback: session.feedback || '',
        canFinish: session.tasks.every((t) => t.status !== 'pending'),
      });
      if (session.status !== 'active') this.stopRecording();
      this.clock();
    },
    clock() {
      clearTimeout(this.tick);
      const s = this.data.session;
      if (!s) return;
      const ms =
        Number(s.elapsed || 0) +
        (s.status === 'active' ? Math.max(0, Date.now() - Number(s.lastResume || Date.now())) : 0);
      this.setData({
        elapsedText: Math.floor(ms / 60000) + '分' + Math.floor((ms / 1000) % 60) + '秒',
      });
      if (this.nativeVisible && s.status === 'active')
        this.tick = setTimeout(() => this.clock(), 1000);
    },
    stopRecording() {
      clearTimeout(this.trackTimer);
      this.setData({ recording: false });
    },
    recording(e) {
      if (!e.detail.value) return this.stopRecording();
      if (!api.requireLogin() || this.data.session?.status !== 'active') return;
      this.setData({ recording: true, trackError: '' });
      this.track();
    },
    async track() {
      const owner = api.session()?.account.id;
      if (!this.data.recording || !this.nativeVisible || this.data.session.status !== 'active')
        return;
      try {
        const p = await require('../../services/model').location('wgs84');
        if (!this.data.recording || !this.nativeVisible || owner !== api.session()?.account.id)
          return;
        if (p.accuracy <= 200)
          await api.request('/api/sessions/' + this.id + '/track', 'POST', { points: [p] });
      } catch (e) {
        this.setData({ trackError: e.message });
        this.stopRecording();
      }
      if (this.data.recording) this.trackTimer = setTimeout(() => this.track(), 10000);
    },
    async clearPhoto(e) {
      try {
        await api.request('/api/sessions/' + this.id, 'PATCH', {
          action: 'photo',
          taskId: e.currentTarget.dataset.id,
          mediaId: null,
        });
        await this.load();
      } catch (e) {
        api.message(e);
      }
    },
    async photo(e) {
      if (this.data.busy) return;
      const owner = api.session()?.account.id;
      try {
        const photo = require('../../services/photo'),
          file = await photo.choose();
        const canvas = await new Promise((resolve) =>
          this.createSelectorQuery()
            .select('#journey-photo')
            .fields({ node: true })
            .exec((r) => resolve(r[0]?.node)),
        );
        const pic = await photo.dataURL(await photo.compress(file, canvas));
        if (owner !== api.session()?.account.id) return;
        const r = await api.request('/api/media', 'POST', { photo: pic });
        await api.request('/api/sessions/' + this.id, 'PATCH', {
          action: 'photo',
          taskId: e.currentTarget.dataset.id,
          mediaId: r.id,
        });
        await this.load();
      } catch (e) {
        api.message(e);
      }
    },
  }),
);
