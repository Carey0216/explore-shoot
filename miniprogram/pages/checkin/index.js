const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const model = require('../../services/model');
const photo = require('../../services/photo');
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
    },
    onLoad(options) {
      this.pointId = options.point;
      this.spotId = options.spot || '';
      this.submissionId = model.uuid();
    },
    onShow() {
      if (!api.requireLogin()) return;
      if (this.owner !== api.session().account.id) {
        this.owner = api.session().account.id;
        this.submissionId = model.uuid();
        this.mediaId = null;
        this.location = null;
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
    note(e) {
      this.setData({ note: e.detail.value });
    },
    caption(e) {
      this.setData({ caption: e.detail.value });
    },
    share(e) {
      this.setData({ share: e.detail.value });
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
        this.setData({ photo: compressed });
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
          const result = await api.request('/api/media', 'POST', { photo: data });
          this.mediaId = result.id;
        }
        const location =
          this.location && Date.now() - this.location.at < 25000 ? this.location : null;
        await api.request('/api/checkins', 'POST', {
          pointId: this.pointId,
          spotId: this.spotId || null,
          accountId: this.owner,
          submissionId: this.submissionId,
          note: this.data.note,
          mediaId: this.mediaId || null,
          location,
          shareToWall: this.data.share,
          publicCaption: this.data.caption,
        });
        this.completed = true;
        this.mediaId = null;
        wx.showToast({ title: '打卡已保存', icon: 'success' });
        wx.switchTab({ url: '/pages/my/index' });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ saving: false });
        if (this.unloaded && !this.completed) this.release();
      }
    },
    onUnload() {
      this.unloaded = true;
      if (!this.data.saving && !this.completed) this.release();
    },
  }),
);
