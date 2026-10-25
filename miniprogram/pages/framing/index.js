const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: {
      spot: null,
      camera: false,
      opacity: 0.4,
      heading: '未开启朝向参考',
      error: '',
      example: '',
    },
    onLoad(options) {
      this.id = options.id;
      this.load();
    },
    async load() {
      try {
        const flags = await api.request('/api/features');
        if (flags.features.framing.enabled === false) throw Error('取景辅助暂未开放');
        const spot = await api.request('/api/shooting-spots/' + this.id);
        this.setData({ spot });
        if (spot.photo)
          try {
            const example = await api.download(spot.photo, false);
            if (!this.gone) this.setData({ example });
          } catch (_) {}
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    start() {
      if (this.data.spot) this.setData({ camera: true, error: '' });
    },
    async capture() {
      if (this.data.capturing || !this.data.camera || !api.requireLogin()) return;
      if (!require('../../services/features').allow('publishing')) return;
      const owner = api.session().account.id,
        spot = this.data.spot;
      this.setData({ capturing: true, error: '' });
      try {
        const draft = require('../../services/checkin-draft');
        const old = draft.load(owner, spot.pointId, spot.id);
        if (old?.photo) throw Error('此机位已有照片草稿，请先保存或移除后再拍摄');
        const shot = await new Promise((resolve, reject) =>
          wx
            .createCameraContext(this)
            .takePhoto({ quality: 'normal', success: resolve, fail: reject }),
        );
        if (this.gone || !this.visible || api.session()?.account.id !== owner) return;
        await draft.save(owner, spot.pointId, spot.id, {
          ...old,
          photo: shot.tempImagePath,
          submissionId: require('../../services/model').uuid(),
          uploadId: require('../../services/model').uuid(),
        });
        this.stop();
        wx.navigateTo({
          url:
            '/pages/checkin/index?point=' +
            encodeURIComponent(spot.pointId) +
            '&spot=' +
            encodeURIComponent(spot.id),
        });
      } catch (e) {
        if (!this.gone) this.setData({ error: e.message || '拍摄失败，请重试' });
      } finally {
        if (!this.gone) this.setData({ capturing: false });
      }
    },
    opacity(e) {
      this.setData({ opacity: e.detail.value / 100 });
    },
    error(e) {
      this.setData({
        camera: false,
        error: '相机未能开启，请检查微信相机权限。仍可参考示例图和方向。',
      });
    },
    onShow() {
      this.visible = true;
    },
    async compass() {
      try {
        await new Promise((resolve, reject) => wx.startCompass({ success: resolve, fail: reject }));
        if (this.gone || !this.visible) {
          wx.stopCompass({ fail() {} });
          return;
        }
        this.listener = (res) =>
          this.setData({
            heading: '设备参考朝向 ' + Math.round(res.direction) + '°（需现场校准）',
          });
        wx.onCompassChange(this.listener);
      } catch (e) {
        api.message(Error('当前设备无法读取朝向'));
      }
    },
    stop() {
      this.setData({ camera: false });
      if (this.listener) wx.offCompassChange(this.listener);
      this.listener = null;
      wx.stopCompass({ fail() {} });
    },
    onHide() {
      this.visible = false;
      this.stop();
    },
    onUnload() {
      this.gone = true;
      this.stop();
    },
  }),
);
