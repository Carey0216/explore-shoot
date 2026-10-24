const api = require('../../services/api'),
  photo = require('../../services/photo'),
  model = require('../../services/model');
const draft = require('../../services/checkin-draft');
const { toTencent, fromTencent } = require('../../services/coordinates'),
  { pageOptions } = require('../../services/page');
function galleryState(photos) {
  return {
    photos: photos.map((entry, index) => ({
      ...entry,
      label: index === 0 ? '封面' : '照片',
      position: index === 0 ? '' : index + 1,
    })),
    canAddPhotos: photos.length < 9,
    photoCount: photos.length,
  };
}
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
      photos: [],
      canAddPhotos: true,
      photoCount: 0,
      deletePhotoId: '',
      activePhoto: null,
      choosing: false,
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
      this.uploadId = model.uuid();
      const saved = draft.load(this.owner, 'publish', '');
      if (saved) {
        this.coordinate = saved.coordinate;
        this.submission = saved.submissionId || this.submission;
        this.uploadId = saved.uploadId || this.uploadId;
        this.setData({
          name: saved.name || '',
          description: saved.description || '',
          condition: saved.condition || '',
          theme: saved.theme || '建筑',
          photo: saved.photo || '',
          ...galleryState(
            saved.photos ||
              (saved.photo
                ? [{ id: 'legacy', path: saved.photo, uploadId: saved.uploadId || this.uploadId }]
                : []),
          ),
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
          ...galleryState([]),
          activePhoto: null,
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
          photo: this.data.photos[0]?.path || '',
          photos: this.data.photos,
          coordinate: this.coordinate,
          submissionId: this.submission,
          uploadId: this.uploadId,
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
      if (this.data.saving || this.data.choosing || this.data.photos.length >= 9) return;
      this.setData({ choosing: true, deletePhotoId: '' });
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
        const photos = [
          ...this.data.photos,
          { id: model.uuid(), path: compressed, uploadId: model.uuid() },
        ];
        this.setData({ ...galleryState(photos), photo: photos[0].path });
        await this.persist();
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) api.message(e);
      } finally {
        if (!this.unloaded) this.setData({ choosing: false });
      }
    },
    photoOpen(e) {
      if (this.data.saving) return;
      this.setData({
        activePhoto: this.data.photos.find((p) => p.id === e.currentTarget.dataset.id),
        deletePhotoId: '',
      });
    },
    photoClose() {
      this.setData({ activePhoto: null });
    },
    async cover() {
      if (this.data.saving || !this.data.activePhoto) return;
      const selected = this.data.activePhoto,
        photos = [selected, ...this.data.photos.filter((p) => p.id !== selected.id)];
      this.setData({ ...galleryState(photos), photo: selected.path, activePhoto: null });
      await this.persist();
    },
    photoDelete(e) {
      if (this.data.saving) return;
      const id = e.currentTarget.dataset.id;
      const window = wx.getWindowInfo();
      const width = Math.min(312, window.windowWidth - 24);
      this.setData({
        deletePhotoId: id,
        deleteWidth: width,
        deleteLeft: (window.windowWidth - width) / 2,
        deleteTop: Math.max(16, (window.windowHeight - 170) / 2),
      });
      wx.createSelectorQuery()
        .in(this)
        .select('.photo-remove[data-id="' + id + '"]')
        .boundingClientRect((rect) => {
          if (!rect || this.data.deletePhotoId !== id) return;
          this.setData({
            deleteLeft: Math.max(12, Math.min(rect.left, window.windowWidth - width - 12)),
            deleteTop: Math.max(16, Math.min(rect.top - 170, window.windowHeight - 190)),
          });
        })
        .exec();
    },
    photoKeep() {
      this.setData({ deletePhotoId: '' });
    },
    async photoRemove() {
      if (this.data.saving) return;
      const entry = this.data.photos.find((p) => p.id === this.data.deletePhotoId);
      if (!entry) return;
      this.mediaIds ||= {};
      const id = this.mediaIds[entry.id];
      const photos = this.data.photos.filter((p) => p !== entry);
      this.setData({ ...galleryState(photos), photo: photos[0]?.path || '', deletePhotoId: '' });
      await this.persist();
      if (id) {
        await api.request('/api/media/' + id, 'DELETE').catch(() => {});
        delete this.mediaIds[entry.id];
      }
    },
    async submit() {
      if (this.data.saving) return;
      if (!this.coordinate || !this.data.photos.length) {
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
        this.mediaIds ||= {};
        const ids = [];
        for (const entry of this.data.photos) {
          if (api.session()?.account.id !== this.owner || this.unloaded)
            throw Error('页面或账号已改变');
          if (!this.mediaIds[entry.id])
            this.mediaIds[entry.id] = (
              await api.request('/api/media', 'POST', {
                photo: await photo.dataURL(entry.path),
                submissionId: entry.uploadId,
              })
            ).id;
          ids.push(this.mediaIds[entry.id]);
        }
        if (api.session()?.account.id !== this.owner || this.unloaded)
          throw Error('页面或账号已改变');
        await api.request('/api/points', 'POST', {
          name: this.data.name,
          description: this.data.description,
          condition: this.data.condition,
          theme: this.data.theme,
          ...this.coordinate,
          mediaId: ids[0],
          mediaIds: ids,
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
    },
  }),
);
