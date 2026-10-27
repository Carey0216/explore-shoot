const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const model = require('../../services/model');
const photo = require('../../services/photo');
const draft = require('../../services/checkin-draft');
Page(
  pageOptions({
    data: {
      title: '',
      spotTitle: '',
      note: '',
      caption: '',
      photo: '',
      share: false,
      saving: false,
      choosing: false,
      located: false,
      canShare: false,
      takenAt: '',
      device: '',
      focalLength: '',
      tips: '',
      retry: false,
      draftMessage: '',
    },
    onLoad(options) {
      this.activity = options.activity || '';
      this.pointId = options.point;
      this.spotId = options.spot || '';
      this.submissionId = model.uuid();
      this.uploadId = model.uuid();
    },
    onShow() {
      if (!api.requireLogin()) return;
      if (this.owner !== api.session().account.id) {
        this.owner = api.session().account.id;
        this.submissionId = model.uuid();
        this.uploadId = model.uuid();
        this.mediaId = null;
        this.location = null;
        const saved = draft.load(this.owner, this.pointId, this.spotId);
        if (saved) {
          this.submissionId = saved.submissionId || this.submissionId;
          this.uploadId = saved.uploadId || this.uploadId;
          this.setData({ ...saved, draftMessage: '已恢复本机草稿，确认后可继续提交' });
        }
      }
      this.load();
    },
    async load() {
      try {
        const catalog = await api.request('/api/catalog');
        const point = catalog.points.find((p) => p.id === this.pointId);
        if (!point) throw Error('地点不存在或已下线');
        this.setData({ title: point.name });
        if (this.spotId) {
          const spot = await api.request('/api/shooting-spots/' + this.spotId);
          if (spot.pointId !== this.pointId) throw Error('机位不属于该地点');
          this.setData({
            spotTitle: spot.title,
            canShare: spot.availability !== 'closed' && !api.session().account.wechatTestAccount,
          });
        }
      } catch (e) {
        api.message(e);
      }
    },
    persist() {
      if (!this.owner || this.completed) return Promise.resolve();
      const owner = this.owner,
        point = this.pointId,
        spot = this.spotId;
      const data = {
        note: this.data.note,
        caption: this.data.caption,
        share: this.data.share,
        photo: this.data.photo,
        takenAt: this.data.takenAt,
        device: this.data.device,
        focalLength: this.data.focalLength,
        tips: this.data.tips,
        submissionId: this.submissionId,
        uploadId: this.uploadId,
      };
      this.draftQueue = (this.draftQueue || Promise.resolve())
        .catch(() => {})
        .then(() => draft.save(owner, point, spot, data));
      return this.draftQueue.catch(() => {
        if (!this.unloaded)
          this.setData({ draftMessage: '本机存储不足，草稿未能完整保存，请不要关闭页面' });
      });
    },
    experience(e) {
      if (!require('../../services/features').allow('experience')) return;
      this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
      void this.persist();
    },
    note(e) {
      this.setData({ note: e.detail.value });
      void this.persist();
    },
    caption(e) {
      this.setData({ caption: e.detail.value });
      void this.persist();
    },
    share(e) {
      if (!require('../../services/features').allow('work-wall')) {
        this.setData({ share: false });
        return;
      }
      this.setData({ share: e.detail.value });
      void this.persist();
    },
    async choose() {
      if (this.data.saving || this.data.choosing) return;
      this.setData({ choosing: true });
      try {
        const original = await photo.choose();
        const canvas = await new Promise((resolve) =>
          wx
            .createSelectorQuery()
            .in(this)
            .select('#photo-export')
            .fields({ node: true })
            .exec((result) => resolve(result[0] && result[0].node)),
        );
        const compressed = await photo.compress(original, canvas);
        if (this.unloaded || !api.session() || api.session().account.id !== this.owner) return;
        await this.release();
        this.uploadId = model.uuid();
        this.setData({ photo: compressed });
        await this.persist();
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) api.message(e);
      } finally {
        if (!this.unloaded) this.setData({ choosing: false });
      }
    },
    async locate() {
      try {
        this.location = await model.location();
        this.setData({ located: true });
      } catch (e) {
        api.message(e);
      }
    },
    async release() {
      if (!this.mediaId) return;
      const id = this.mediaId;
      this.mediaId = null;
      try {
        await api.request('/api/media/' + id, 'DELETE');
      } catch (_) {
        /* Server TTL is the fallback. */
      }
    },
    async submit() {
      if (this.data.saving || this.data.choosing || !api.requireLogin()) return;
      if (api.session().account.id !== this.owner)
        return api.message(Error('账号已改变，请重新打开打卡页面'));
      if (!this.data.note.trim() && !this.data.photo)
        return api.message(Error('请选择照片或写一点感受'));
      if (this.data.share && (!this.data.photo || !this.spotId))
        return api.message(Error('公开作品需要照片和独立机位'));
      this.setData({ saving: true });
      try {
        if (this.data.photo && !this.mediaId) {
          const data = await photo.dataURL(this.data.photo);
          const result = await api.request('/api/media', 'POST', {
            photo: data,
            submissionId: this.uploadId,
          });
          this.mediaId = result.id;
        }
        const location =
          this.location && Date.now() - this.location.at < 25000 ? this.location : null;
        const record = await api.request('/api/checkins', 'POST', {
          pointId: this.pointId,
          spotId: this.spotId || null,
          accountId: this.owner,
          submissionId: this.submissionId,
          note: this.data.note,
          mediaId: this.mediaId || null,
          location,
          shareToWall: this.data.share,
          publicCaption: this.data.caption,
          experience:
            this.data.share && require('../../services/features').enabled('experience')
              ? {
                  takenAt: this.data.takenAt ? new Date(this.data.takenAt).toISOString() : '',
                  device: this.data.device,
                  focalLength: this.data.focalLength,
                  tips: this.data.tips,
                }
              : {},
        });
        if (require('../../services/photo-task').get()?.pointId === this.pointId)
          require('../../services/photo-task').clear();
        getApp().globalData.pendingNativeEvent = {
          owner: this.owner,
          event: 'checkin-saved',
          origin: require('../../services/network').configuredOrigin(),
        };
        getApp().globalData.pendingPassportRewards = {
          owner: this.owner,
          events: record.passportEvents || {},
          origin: require('../../services/network').configuredOrigin(),
        };
        await this.draftQueue;
        this.completed = true;
        draft.remove(this.owner, this.pointId, this.spotId);
        this.mediaId = null;
        wx.showToast({ title: '打卡已保存', icon: 'success' });
        if (this.activity) wx.redirectTo({ url: '/pages/topic/index?id=' + this.activity });
        else wx.switchTab({ url: '/pages/my/index' });
      } catch (e) {
        await this.persist();
        this.setData({
          retry: true,
          draftMessage: '提交失败，草稿已保留。检查网络后点击重试；不会重复创建打卡。',
        });
        api.message(e);
      } finally {
        this.setData({ saving: false });
        if (this.unloaded && !this.completed) this.release();
      }
    },
    onHide() {
      void this.persist();
    },
    onUnload() {
      void this.persist();
      this.unloaded = true;
      if (!this.data.saving && !this.completed) this.release();
    },
  }),
);
