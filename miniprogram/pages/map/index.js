const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { toTencent } = require('../../services/coordinates');
const model = require('../../services/model');
Page(
  pageOptions({
    data: {
      tab: 'map',
      tilted: false,
      latitude: 38.496,
      longitude: 106.107,
      markers: [],
      points: [],
      selected: null,
      error: '',
      loading: false,
      current: false,
      polyline: [],
      route: null,
      navigating: false,
      voiceEnabled: false,
      voiceBusy: false,
      voices: [],
      voiceName: '',
      stepIndex: 0,
      reading: '',
      compass: 0,
    },
    onLoad() {
      this.load();
    },
    onHide() {
      this.stopNavigation();
      this.navSerial = (this.navSerial || 0) + 1;
    },
    onUnload() {
      this.stopNavigation();
    },
    onShow() {
      const tab = getApp().globalData.mapTab;
      if (tab) {
        this.setData({ tab });
        getApp().globalData.mapTab = null;
      }
      const id = getApp().globalData.destination;
      if (id && this.data.points.length) this.select(id);
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const [result, directory] = await Promise.all([
          api.request('/api/catalog'),
          api.cached('/api/maps/places').catch(() => ({ places: [] })),
        ]);
        const known = new Set(result.points.map((p) => p.id));
        const destinations = [
          ...result.points,
          ...(directory.places || [])
            .filter((p) => !known.has(p.id))
            .map((p) => ({
              ...p,
              directory: true,
              address: [p.zone, p.category].filter(Boolean).join(' · '),
            })),
        ];
        this.catalog = result;
        this.points = destinations;
        void api
          .cached('/api/navigation/voices')
          .then((r) => this.setData({ voices: r.voices || [] }))
          .catch(() => {});
        const markers = destinations.map((p, i) => {
          const c = toTencent(p);
          return {
            id: i + 1,
            longitude: c.lng,
            latitude: c.lat,
            iconPath: '/assets/pin.png',
            width: p.directory ? 17 : 22,
            height: p.directory ? 23 : 29,
            callout: {
              content: p.name,
              display: 'BYCLICK',
              padding: 8,
              borderRadius: 8,
              color: '#245b4c',
            },
          };
        });
        this.setData({
          points: destinations,
          photoPoints: result.points.map(model.pointView),
          photoColumns: [
            result.points.filter((_, i) => i % 2 === 0).map(model.pointView),
            result.points.filter((_, i) => i % 2 === 1).map(model.pointView),
          ],
          markers,
        });
        const id = getApp().globalData.destination;
        this.select(id || (result.points[0] && result.points[0].id));
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    selectCard(e) {
      this.select(e.currentTarget.dataset.id);
    },
    select(id) {
      this.stopNavigation();
      this.navSerial = (this.navSerial || 0) + 1;
      this.setData({ route: null, polyline: [], stepIndex: 0 });
      const selected = this.data.points.find((p) => p.id === id);
      if (!selected) return;
      const c = toTencent(selected);
      this.setData({ selected, longitude: c.lng, latitude: c.lat });
      getApp().globalData.destination = null;
    },
    marker(e) {
      const p = this.points[e.detail.markerId - 1];
      if (p) this.select(p.id);
    },
    picker(e) {
      const p = this.points[Number(e.detail.value)];
      if (p) this.select(p.id);
    },
    tab(e) {
      this.setData({ tab: e.currentTarget.dataset.id });
    },
    toggleTilt() {
      if (require('../../services/features').allow('map-3d'))
        this.setData({ tilted: !this.data.tilted });
    },
    placement() {
      if (
        require('../../services/features').allow('map-3d') &&
        require('../../services/features').allow('campus-3d')
      )
        wx.navigateTo({ url: '/scenes/campus/index?mode=placement' });
    },
    planRoute() {
      if (this.data.selected) {
        this.setData({ tab: 'navigation' });
        this.walk();
      }
    },
    scene(e) {
      if (
        !require('../../services/features').allow(
          e.currentTarget.dataset.mode === 'panorama' ? 'panorama' : 'campus-3d',
        )
      )
        return;
      wx.navigateTo({ url: '/scenes/campus/index?mode=' + e.currentTarget.dataset.mode });
    },
    routes() {
      wx.navigateTo({ url: '/pages/journey/index' });
    },
    guides() {
      wx.navigateTo({ url: '/pages/guides/index' });
    },
    async walk() {
      if (this.data.loading || !this.data.selected) return;
      const serial = (this.navSerial = (this.navSerial || 0) + 1),
        target = this.data.selected;
      this.setData({ loading: true, error: '' });
      try {
        const position = await model.location('wgs84');
        if (position.accuracy > 100) throw Error('当前定位精度较低，请到开阔处重试');
        const route = await require('../../services/campus-walking').campusWalking(
          null,
          this.catalog.map?.tencentKey,
          position,
          target,
          {
            campus: this.catalog.campus,
            alive: () => serial === this.navSerial && this.nativeVisible,
          },
        );
        if (serial !== this.navSerial) return;
        if (!route.available) throw Error(route.reason);
        const points = route.path.map((p) => {
          const q = toTencent(p);
          return { latitude: q.lat, longitude: q.lng };
        });
        const location = toTencent(position);
        this.setData({
          route,
          polyline: [{ points, color: '#4285dc', width: 5, arrowLine: true }],
          latitude: location.lat,
          longitude: location.lng,
          current: true,
          stepIndex: 0,
          reading: route.steps[0]?.instruction || '请按地图道路前行',
        });
      } catch (e) {
        if (serial === this.navSerial) this.setData({ error: e.message });
      } finally {
        if (serial === this.navSerial) this.setData({ loading: false });
      }
    },
    startNavigation() {
      if (this.data.navigating) {
        this.stopNavigation();
        return;
      }
      if (!this.data.route) return this.walk();
      this.setData({ navigating: true });
      this.pollNavigation();
    },
    stopNavigation() {
      clearTimeout(this.navTimer);
      this.stopAudio?.();
      this.stopAudio = null;
      this.setData({ navigating: false, voiceBusy: false });
    },
    async pollNavigation() {
      if (!this.nativeVisible || !this.data.navigating) return;
      const serial = this.navSerial;
      try {
        const p = await model.location('wgs84');
        if (!this.nativeVisible || !this.data.navigating || serial !== this.navSerial) return;
        const target = this.data.selected,
          route = this.data.route;
        if (p.accuracy > 100) throw Error('位置精度不足，请留意现场道路');
        const { distance, direction } = require('../../services/routing');
        const near = route.path.reduce(
          (a, b, i) => (distance(b, p) < a.distance ? { index: i, distance: distance(b, p) } : a),
          { index: 0, distance: Infinity },
        );
        const final = distance(p, target);
        let index = route.steps.findIndex((s) => s.indices && s.indices[1] / 2 >= near.index);
        if (index < 0) index = route.steps.length - 1;
        const step = route.steps[index];
        const reading =
          final < 25
            ? '已到达地点附近，请核对真实拍摄站位'
            : near.distance > 65
              ? '当前位置偏离路线，请核对道路后重新规划'
              : step?.instruction || '请沿地图道路前行';
        const q = toTencent(p);
        this.setData({
          reading,
          stepIndex: index,
          compass: direction(p, target),
          distanceText: Math.round(final) + '米',
          ...(this.data.preferences.mapFollow ? { latitude: q.lat, longitude: q.lng } : {}),
        });
        if (reading !== this.lastSpoken && this.data.voiceEnabled) {
          this.lastSpoken = reading;
          void this.speak(reading);
        }
        if (final < 25) this.stopNavigation();
      } catch (e) {
        if (serial === this.navSerial) this.setData({ reading: e.message || '暂未取得当前位置' });
      }
      if (this.data.navigating) this.navTimer = setTimeout(() => this.pollNavigation(), 6000);
    },
    voice(e) {
      this.setData({ voiceEnabled: e.detail.value });
      if (!e.detail.value) this.stopAudio?.();
    },
    async voicePick(e) {
      try {
        await require('../../services/appearance').update({
          voiceId: this.data.voices[Number(e.detail.value)].id,
        });
        this.setData({
          voiceName:
            this.data.voices[Number(e.detail.value)].label ||
            this.data.voices[Number(e.detail.value)].name,
        });
      } catch (err) {
        api.message(err);
      }
    },
    async speak(text) {
      if (this.data.voiceBusy) return;
      const serial = this.navSerial;
      this.setData({ voiceBusy: true });
      try {
        const voice = require('../../services/voice'),
          file = await voice.audio(text, this.data.preferences.voiceId);
        if (!this.nativeVisible || serial !== this.navSerial) {
          wx.getFileSystemManager().unlink({ filePath: file, fail() {} });
          return;
        }
        this.stopAudio?.();
        this.stopAudio = voice.play(file);
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ voiceBusy: false });
      }
    },
    async locate() {
      try {
        const p = await model.location('gcj02');
        this.setData({ longitude: p.lng, latitude: p.lat, current: true });
      } catch (e) {
        api.message(e);
      }
    },
    navigate() {
      if (!this.data.selected) return;
      const p = this.data.selected,
        c = toTencent(p);
      wx.openLocation({
        latitude: c.lat,
        longitude: c.lng,
        name: p.name,
        address: p.address || '',
        scale: 18,
        fail() {
          api.message(Error('地图打开失败，请稍后重试'));
        },
      });
    },
    detail() {
      if (this.data.selected?.directory)
        return api.message(
          this.data.selected.description || '校园目录地点，可点击导航前往；尚未关联独立拍摄详情。',
        );
      if (this.data.selected)
        wx.navigateTo({ url: '/pages/detail/index?id=' + this.data.selected.id });
    },
    passport() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/passport/index' });
    },
  }),
);
