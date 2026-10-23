const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      campusPeriod: 'day',
      mode: 'photo',
      canvasVisible: true,
      administrator: false,
      placement: null,
      loading: false,
      error: '',
      models: [],
      zone: '',
      selected: 0,
      textured: true,
      status: '三维外观与高度为估算，不能替代现场导航。',
    },
    onLoad(o) {
      this.asAdmin = o.admin === '1';
      this.setData({ administrator: this.asAdmin });
      this.setData({
        mode: ['photo', 'model', 'panorama', 'passport', 'placement'].includes(o.mode)
          ? o.mode
          : 'photo',
      });
      this.updateSceneTitle();
    },
    updateSceneTitle() {
      const title =
        this.data.mode === 'panorama'
          ? '校园实景全景'
          : this.data.mode === 'passport'
            ? '三维校园护照'
            : this.data.mode === 'placement'
              ? '模型位置预览'
              : '三维校园';
      this.setData({ sceneTitle: title });
      wx.setNavigationBarTitle?.({ title });
    },
    onReady() {
      this.load();
    },
    releaseScene() {
      clearInterval(this.timeTimer);
      this.offTime?.();
      this.offTime = null;
      this.serial = (this.serial || 0) + 1;
      this.model?.clear();
      this.model = null;
      this.scene?.dispose();
      this.scene = null;
      this.setData({ loading: false, canvasVisible: false });
    },
    onHide() {
      this.releaseScene();
    },
    onUnload() {
      this.releaseScene();
    },
    onShow() {
      this.updateSceneTitle();
      this.offTime?.();
      this.offTime = require('../../services/appearance').subscribe(() => this.refreshPeriod());
      clearInterval(this.timeTimer);
      this.timeTimer = setInterval(() => this.refreshPeriod(), 15000);
      if (this.started && !this.scene && !this.data.loading)
        this.setData({ canvasVisible: true }, () => wx.nextTick(() => this.load()));
    },
    async load() {
      if (this.data.loading || !this.nativeVisible) return;
      this.started = true;
      const serial = (this.serial = (this.serial || 0) + 1);
      this.setData({ loading: true, error: '' });
      try {
        if (this.data.mode === 'passport' && !api.requireLogin()) return;
        if (this.asAdmin && !require('../../services/admin-api').session()) {
          wx.redirectTo({ url: '/pages/admin/index' });
          return;
        }
        const features = require('../../services/features');
        if (!this.asAdmin) await features.load();
        if (serial !== this.serial || !this.nativeVisible) return;
        if (this.data.mode === 'passport' && !features.allow('passport'))
          throw Error(features.maintenance);
        if (
          !this.asAdmin &&
          !features.allow(this.data.mode === 'panorama' ? 'panorama' : 'campus-3d')
        )
          throw Error(features.maintenance);
        const node = await new Promise((resolve) =>
          this.createSelectorQuery()
            .select('#campus-scene')
            .fields({ node: true, size: true })
            .exec((r) => resolve(r[0])),
        );
        if (serial !== this.serial || !this.nativeVisible) return;
        if (!node?.node) throw Error('当前设备暂不支持三维画布');
        this.scene?.dispose();
        const engine = require('../renderer');
        this.scene = engine.makeRenderer(
          node.node,
          node.width,
          node.height,
          this.data.themeClass.includes('dark'),
        );
        this.period = require('../../services/campus-time').current();
        this.scene.setPeriod(this.period);
        this.setData({ campusPeriod: this.period });
        if (this.data.mode === 'placement') {
          const admin = require('../../services/admin-api'),
            [data, placements] = await Promise.all([
              this.asAdmin ? admin.request('/campus-map/model') : api.request('/api/maps/model'),
              this.asAdmin
                ? admin.request('/campus-map/map-models')
                : api.request('/api/maps/map-models'),
            ]);
          if (serial !== this.serial) return;
          const pending = getApp().globalData.mapModelPreview;
          getApp().globalData.mapModelPreview = null;
          const p =
            this.asAdmin &&
            pending?.owner === admin.session()?.account.id &&
            pending.origin === require('../../services/network').configuredOrigin()
              ? pending.value
              : placements.models[0];
          if (!p) throw Error('暂未发布地图配准模型');
          const clock = require('../../services/map-placement').placementModel(data, p);
          data.models = data.models.filter((m) => m.id !== 'clock');
          this.allModels = data.models;
          this.model = engine.campus(this.scene, data);
          await this.model.selected(clock);
          if (serial !== this.serial) return;
          this.scene.focus(clock, data.models);
          const c = require('../../services/coordinates').toTencent(p);
          this.setData({
            placement: { ...p, latitude: c.lat, longitude: c.lng },
            placementMarkers: [
              {
                id: 1,
                longitude: c.lng,
                latitude: c.lat,
                iconPath: '/assets/pin.png',
                width: 22,
                height: 29,
              },
            ],
            status:
              (this.asAdmin ? '仅管理端预览 · 不自动保存或发布。' : '已发布的模型位置。') +
              ' 配准位置看下方地图；模型外观、高度仍为估算。',
          });
        } else if (this.data.mode === 'panorama') {
          await engine.panorama(this.scene, this.period);
          if (serial !== this.serial || !this.nativeVisible) return;
          this.setData({ status: '真实航拍 · 单一位置环视，不能自由行走，不用于导航定位。' });
        } else {
          const data = await api.request(
            this.data.mode === 'passport'
              ? '/api/my/passport/scene'
              : this.data.mode === 'photo'
                ? '/api/maps/photo-model'
                : '/api/maps/model',
          );
          if (serial !== this.serial) return;
          this.allModels = data.models;
          this.model = engine.campus(this.scene, data);
          this.setData({
            models: [{ id: '', name: '校园总览' }, ...data.models],
            ...(data.passport ? { status: data.notice } : {}),
          });
        }
      } catch (e) {
        if (serial === this.serial)
          this.setData({ error: e.message || '三维资料暂不可用，请重试' });
      } finally {
        if (serial === this.serial) this.setData({ loading: false });
      }
    },
    async refreshPeriod() {
      if (!this.nativeVisible || !this.scene || this.data.loading) return;
      const period = require('../../services/campus-time').current();
      if (period === this.period) return;
      this.period = period;
      this.setData({ campusPeriod: period });
      const scene = this.scene;
      scene.setPeriod(period);
      if (this.data.mode === 'panorama') {
        try {
          await require('../renderer').panorama(scene, period);
        } catch (e) {
          if (this.scene === scene && this.period === period && this.nativeVisible)
            this.setData({ error: e.message || '全景切换失败，请重试' });
        }
      }
    },
    async campusTime(e) {
      if (!require('../../services/features').allow('campus-time')) return;
      try {
        await require('../../services/appearance').update(
          { campusTime: ['auto', 'day', 'evening'][Number(e.detail.value)] },
          this.asAdmin,
        );
      } catch (e) {
        api.message(e);
      }
    },
    featuresChanged() {
      this.refreshPeriod();
    },
    touchStart(e) {
      this.touch = e.touches.map((t) => ({ x: t.x, y: t.y }));
    },
    touchMove(e) {
      if (!this.scene || !this.touch?.length) return;
      const points = e.touches;
      if (points.length === 2 && this.touch.length === 2) {
        const a = Math.hypot(this.touch[0].x - this.touch[1].x, this.touch[0].y - this.touch[1].y),
          b = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (a > 5 && b > 5) this.scene.zoom(a / b);
      } else if (points.length === 1)
        this.scene.rotate(points[0].x - this.touch[0].x, points[0].y - this.touch[0].y);
      this.touch = points.map((t) => ({ x: t.x, y: t.y }));
    },
    pick(e) {
      const i = Number(e.detail.value),
        model = this.data.models[i];
      this.setData({
        selected: i,
        status: model.id
          ? model.name + ' · 外观、高度与位置估算'
          : '校园总览 · 外观、高度与位置估算',
      });
      this.scene?.focus(model.id ? model : null, this.allModels);
      this.model
        ?.selected(model.id ? model : null)
        .catch(() => api.message('建筑细节暂未载入，已保留轮廓与材质'));
    },
    zone(e) {
      const zone = ['', 'east', 'west'][Number(e.detail.value)],
        models = this.allModels.filter((m) => !zone || m.appearance?.zone === zone);
      this.setData({ zone, models: [{ id: '', name: '校园总览' }, ...models], selected: 0 });
      this.model?.zone(zone);
      this.scene?.focus(null, models);
    },
    turn(e) {
      this.scene?.rotate(Number(e.currentTarget.dataset.value), 0);
    },
    zoom(e) {
      this.scene?.zoom(Number(e.currentTarget.dataset.value));
    },
    flat() {
      this.scene?.flat();
    },
    texture() {
      this.model?.toggle();
      this.setData({ textured: !this.data.textured });
    },
    save() {
      this.scene?.render();
      wx.canvasToTempFilePath(
        {
          canvas: this.scene?.renderer.domElement,
          fileType: 'png',
          success: (r) => wx.previewImage({ urls: [r.tempFilePath] }),
          fail: () => api.message('暂未能保存视图'),
        },
        this,
      );
    },
  }),
);
