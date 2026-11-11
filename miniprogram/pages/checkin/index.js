const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const model = require('../../services/model');
const photo = require('../../services/photo');
const draft = require('../../services/checkin-draft');
const { CHECKIN_LOCATION_TTL, usableCheckinLocation } = require('../../services/checkin-location');
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
      locating: false,
      locationInfo: null,
      locationExpired: false,
      locationError: '',
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
        this.removeLocation();
        const saved = draft.load(this.owner, this.pointId, this.spotId);
        if (saved) {
          this.submissionId = saved.submissionId || this.submissionId;
          this.uploadId = saved.uploadId || this.uploadId;
          this.setData({ ...saved, draftMessage: '已恢复本机草稿，确认后可继续提交' });
        }
      }
      this.refreshLocationInfo();
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
        this.setData({ photo: compressed, photoPreviewError: false });
        await this.persist();
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) api.message(e);
      } finally {
        if (!this.unloaded) this.setData({ choosing: false });
      }
    },
    photoError() {
      this.setData({ photoPreviewError: true });
    },
    previewPhoto() {
      if (this.data.photo) wx.previewImage({ current: this.data.photo, urls: [this.data.photo] });
    },
    async locate() {
      if (this.data.locating || this.data.saving) return;
      const request = (this.locationRequest = (this.locationRequest || 0) + 1);
      const owner = this.owner;
      const active = () =>
        !this.unloaded && request === this.locationRequest && owner === api.session()?.account.id;
      this.setData({ locating: true, locationError: '' });
      try {
        const fix = await model.location();
        if (!active()) return;
        if (!usableCheckinLocation(fix)) throw Error('当前定位精度不足，请到开阔处重新获取');
        this.location = fix;
        this.refreshLocationInfo();
      } catch (e) {
        if (active()) this.setData({ locationError: e.message });
      } finally {
        if (active()) this.setData({ locating: false });
      }
    },
    refreshLocationInfo() {
      clearTimeout(this.locationTimer);
      const fix = this.location;
      const fresh = usableCheckinLocation(fix);
      this.setData({
        locationInfo: fresh
          ? { lat: fix.lat.toFixed(5), lng: fix.lng.toFixed(5), accuracy: Math.round(fix.accuracy) }
          : null,
        locationExpired: !!fix && !fresh,
      });
      if (fresh)
        this.locationTimer = setTimeout(
          () => this.refreshLocationInfo(),
          Math.max(1, fix.at + CHECKIN_LOCATION_TTL - Date.now()),
        );
    },
    removeLocation() {
      this.locationRequest = (this.locationRequest || 0) + 1;
      this.location = null;
      this.setData({ locating: false, locationError: '' });
      this.refreshLocationInfo();
    },
    locationCanSubmit() {
      this.refreshLocationInfo();
      if (!this.data.locationExpired) return true;
      api.message(Error('定位已过期，请重新定位或选择不使用定位'));
      return false;
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
      if (this.data.saving || this.data.choosing || this.data.locating || !api.requireLogin())
        return;
      const owner = this.owner;
      if (api.session().account.id !== owner)
        return api.message(Error('账号已改变，请重新打开打卡页面'));
      if (!this.data.note.trim() && !this.data.photo)
        return api.message(Error('请选择照片或写一点感受'));
      if (this.data.share && (!this.data.photo || !this.spotId))
        return api.message(Error('公开作品需要照片和独立机位'));
      if (!this.locationCanSubmit()) return;
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
        if (this.unloaded || api.session()?.account.id !== owner || !this.locationCanSubmit())
          return;
        const record = await api.request('/api/checkins', 'POST', {
          pointId: this.pointId,
          spotId: this.spotId || null,
          accountId: this.owner,
          submissionId: this.submissionId,
          note: this.data.note,
          mediaId: this.mediaId || null,
          location: this.location,
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
        await this.draftQueue;
        this.completed = true;
        draft.remove(this.owner, this.pointId, this.spotId, this.submissionId);
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
      clearTimeout(this.locationTimer);
      if (!this.data.saving && !this.completed) this.release();
    },
  }),
);
