const api = require('../../services/api'),
  photo = require('../../services/photo'),
  model = require('../../services/model');
const draft = require('../../services/checkin-draft');
const { toTencent, fromTencent } = require('../../services/coordinates'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      name: '',
      description: '',
      condition: '',
      theme: '建筑',
      themes: ['建筑', '自然', '人文', '运动'],
      latitude: 38.496,
      longitude: 106.107,
      markers: [],
      photo: '',
      saving: false,
      error: '',
      mapOpen: false,
      conditionOpen: false,
      previewOpen: false,
      draftMessage: '',
      locationText: '在校园地图上标记',
    },
    async onLoad() {
      if (!api.requireLogin()) return;
      this.owner = api.session().account.id;
      this.submission = model.uuid();
      const saved = draft.load(this.owner, 'publish', '');
      if (saved) {
        this.coordinate = saved.coordinate;
        this.submission = saved.submissionId || this.submission;
        this.setData({
          name: saved.name || '',
          description: saved.description || '',
          condition: saved.condition || '',
          theme: saved.theme || '建筑',
          photo: saved.photo || '',
          draftMessage: '已恢复上次的本机草稿',
          locationText: saved.coordinate ? '位置已标记 · 点击可调整' : '在校园地图上标记',
        });
        if (saved.coordinate) {
          const c = toTencent(saved.coordinate);
          this.setData({
            markers: [
              {
                id: 1,
                latitude: c.lat,
                longitude: c.lng,
                iconPath: '/assets/pin.png',
                width: 26,
                height: 34,
              },
            ],
          });
        }
      }

      try {
        const me = await api.request('/api/auth/me');
        api.updateAccount(me.account);
        if (me.account.scoutStatus !== 'approved') {
          wx.redirectTo({ url: '/pages/scout/index' });
          return;
        }
        const catalog = await api.request('/api/catalog');
        const first = this.coordinate || catalog.points[0];
        if (first) {
          const c = toTencent(first);
          this.setData({ latitude: c.lat, longitude: c.lng });
        }
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    onShow() {
      if (this.owner && api.session()?.account.id !== this.owner) {
        this.coordinate = null;
        this.setData({
          name: '',
          description: '',
          condition: '',
          photo: '',
          markers: [],
          previewOpen: false,
        });
        wx.switchTab({ url: '/pages/discover/index' });
      }
    },
    noop() {},
    locationPanel() {
      this.setData({ mapOpen: !this.data.mapOpen });
    },
    conditionPanel() {
      this.setData({ conditionOpen: !this.data.conditionOpen });
    },
    preview() {
      this.setData({ previewOpen: true });
    },
    closePreview() {
      this.setData({ previewOpen: false });
    },
    policy() {
      wx.showModal({
        title: '公开内容说明',
        content:
          '发布后所有人可见，标注社区共创。管理员将核对资料与内容。请使用原创或获授权的照片，保护他人隐私。',
        showCancel: false,
      });
    },
    selectTheme(e) {
      this.setData({ theme: e.currentTarget.dataset.theme });
      void this.persist();
    },
    async persist() {
      if (!this.owner || this.completed || api.session()?.account.id !== this.owner) return false;
      const owner = this.owner,
        value = {
          name: this.data.name,
          description: this.data.description,
          condition: this.data.condition,
          theme: this.data.theme,
          photo: this.data.photo,
          coordinate: this.coordinate,
          submissionId: this.submission,
        };
      this.draftQueue = (this.draftQueue || Promise.resolve())
        .catch(() => {})
        .then(() => draft.save(owner, 'publish', '', value));
      return this.draftQueue
        .then(() => true)
        .catch(() => {
          if (!this.unloaded)
            this.setData({ draftMessage: '本机空间不足，草稿未能完整保存，请先不要关闭页面' });
          return false;
        });
    },
    async saveDraft() {
      if (await this.persist()) this.setData({ draftMessage: '草稿已保存在本机，下次可以继续' });
    },
    field(e) {
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
      void this.persist();
    },
    theme(e) {
      this.setData({ theme: this.data.themes[Number(e.detail.value)] });
    },
    point(e) {
      if (this.data.saving) return;
      const { latitude, longitude } = e.detail;
      this.coordinate = fromTencent({ lng: longitude, lat: latitude });
      this.setData({
        locationText: '位置已标记 · 点击可调整',
        markers: [
          { id: 1, latitude, longitude, iconPath: '/assets/pin.png', width: 26, height: 34 },
        ],
      });
      void this.persist();
    },
    async choose() {
      if (this.data.saving) return;
      try {
        const original = await photo.choose();
        const canvas = await new Promise((resolve) =>
          wx
            .createSelectorQuery()
            .in(this)
            .select('#photo-export')
            .fields({ node: true })
            .exec((r) => resolve(r[0]?.node)),
        );
        const compressed = await photo.compress(original, canvas);
        if (this.unloaded || api.session()?.account.id !== this.owner) return;
        if (this.mediaId) {
          await api.request('/api/media/' + this.mediaId, 'DELETE').catch(() => {});
          this.mediaId = null;
        }
        this.setData({ photo: compressed });
        await this.persist();
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) api.message(e);
      }
    },
    async submit() {
      if (this.data.saving) return;
      if (!this.coordinate || !this.data.photo) {
        this.setData({ error: '请在地图上确认站位，并选择你有权公开的照片。' });
        return;
      }
      if (api.session()?.account.id !== this.owner) {
        api.message(Error('账号已改变，请重新打开页面'));
        return;
      }
      if (!this.data.name.trim() || this.data.description.trim().length < 5) {
        this.setData({ error: '写一个标题，再用至少5个字分享你的发现吧。' });
        return;
      }
      if (!this.data.condition.trim()) {
        this.setData({ conditionOpen: true, error: '补充一句通行与拍摄提醒，帮助后来的人。' });
        return;
      }
      this.setData({ saving: true, error: '' });
      try {
        if (!this.mediaId)
          this.mediaId = (
            await api.request('/api/media', 'POST', { photo: await photo.dataURL(this.data.photo) })
          ).id;
        await api.request('/api/points', 'POST', {
          name: this.data.name,
          description: this.data.description,
          condition: this.data.condition,
          theme: this.data.theme,
          ...this.coordinate,
          mediaId: this.mediaId,
          submissionId: this.submission,
        });
        await this.draftQueue;
        this.completed = true;
        draft.remove(this.owner, 'publish', '');
        wx.showToast({ title: '发现已发布', icon: 'success' });
        wx.switchTab({ url: '/pages/discover/index' });
      } catch (e) {
        this.setData({ error: e.message + '；内容已保留，可重试。' });
      } finally {
        this.setData({ saving: false });
      }
    },
    onHide() {
      void this.persist();
    },
    onUnload() {
      this.unloaded = true;
      void this.persist();
      if (this.mediaId && !this.completed && !this.data.saving)
        void api.request('/api/media/' + this.mediaId, 'DELETE').catch(() => {});
    },
  }),
);
