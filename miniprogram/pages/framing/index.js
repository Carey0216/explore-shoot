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
