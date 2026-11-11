const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { toTencent } = require('../../services/coordinates');
const { campusOverview, prepareBuildings, buildingFaces } = require('../../services/map-buildings');
const model = require('../../services/model');
Page(
  pageOptions({
    data: {
      tab: 'map',
      tilted: false,
      buildingFaces: [],
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
      routeLoading: false,
      routeError: '',
      navigating: false,
      voiceEnabled: false,
      voiceBusy: false,
      voices: [],
      voiceName: '',
      stepIndex: 0,
      reading: '',
      compass: 0,
      mapScale: 17,
    },
    onLoad() {
      this.load();
    },
    onHide() {
      clearInterval(this.buildingTimer);
      this.stopNavigation();
    },
    onUnload() {
      clearInterval(this.buildingTimer);
      this.stopNavigation();
    },
    onShow() {
      if (this.data.tilted) this.watchBuildingFaces();
      const tab = getApp().globalData.mapTab;
      if (tab) {
        this.setData({ tab });
        getApp().globalData.mapTab = null;
      }
      if (this.syncPhotoDestination()) return;
      const id = getApp().globalData.destination;
      if (id && this.data.points.length) this.select(id);
    },
    syncPhotoDestination() {
      const target = getApp().globalData.photoDestination;
      if (!target || !this.data.points.length) return;
      getApp().globalData.photoDestination = null;
      getApp().globalData.photoDestinationConsumed = true;
      if (target.pointOpen === false || target.availability === 'closed') return;
      getApp().globalData.destination = null;
      this.stopNavigation();
      const coordinates = toTencent(target);
      this.setData({
        selected: target,
        longitude: coordinates.lng,
        latitude: coordinates.lat,
        tab: 'navigation',
        route: null,
        polyline: [],
        stepIndex: 0,
        routeError: '',
      });
      return true;
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
        if (!this.syncPhotoDestination()) {
          const id = getApp().globalData.destination;
          const last = this.data.selected?.id;
          this.select(
            id || (destinations.some((p) => p.id === last) ? last : result.points[0]?.id),
          );
        }
        if (this.fitBuildingsOnLoad) {
          this.fitBuildingsOnLoad = false;
          this.showCampusOverview();
        }
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    regionChanged(e) {
      if (e.type !== 'end' && e.detail?.type !== 'end') return;
      if ((e.causedBy ?? e.detail?.causedBy) === 'update') return;
      const c = wx.createMapContext('campus-map', this);
      this.captureMapCenter(c);
      const { rotate, skew } = e.detail || {};
      const changed =
        (Number.isFinite(rotate) && rotate !== this.mapRotate) ||
        (Number.isFinite(skew) && skew !== this.buildingSkew);
      if (Number.isFinite(rotate)) this.mapRotate = rotate;
      if (this.data.tilted && changed) {
        if (Number.isFinite(skew)) this.buildingSkew = skew;
        this.paintBuildingFaces();
      }
    },
    captureMapCenter(c) {
      c.getScale({
        success: ({ scale }) => {
          if (scale !== this.data.mapScale) this.setData({ mapScale: scale });
        },
      });
      c.getCenterLocation({
        success: ({ latitude, longitude }) => {
          if (latitude !== this.data.latitude || longitude !== this.data.longitude)
            this.setData({ latitude, longitude });
        },
      });
    },
    selectCard(e) {
      this.select(e.currentTarget.dataset.id);
    },
    select(id) {
      const selected = this.data.points.find((p) => p.id === id);
      if (!selected) return;
      getApp().globalData.destination = null;
      if (selected.id === this.data.selected?.id && selected.open !== false) {
        this.setData({ selected });
        return;
      }
      this.stopNavigation();
      const c = toTencent(selected);
      this.setData({
        route: null,
        polyline: [],
        stepIndex: 0,
        routeError: '',
        selected,
        longitude: c.lng,
        latitude: c.lat,
        markers: this.data.markers.map((marker, index) => ({
          ...marker,
          width: this.points[index]?.id === id ? 28 : this.points[index]?.directory ? 17 : 22,
          height: this.points[index]?.id === id ? 36 : this.points[index]?.directory ? 23 : 29,
        })),
      });
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
      const tab = e.currentTarget.dataset.id;
      if (tab !== 'navigation') this.stopNavigation();
      this.setData({ tab });
    },
    toggleTilt() {
      if (!require('../../services/features').allow('map-3d')) return;
      if (this.data.tilted) {
        clearInterval(this.buildingTimer);
        this.buildingLoad = null;
        this.fitBuildingsOnLoad = false;
        this.setData({ tilted: false, buildingFaces: [] });
        return;
      }
      this.buildingSkew = 40;
      this.setData({ tilted: true }, () => this.showCampusOverview());
      this.watchBuildingFaces();
    },
    showCampusOverview() {
      const shouldKeepCamera = () =>
        !this.nativeVisible ||
        !this.data.tilted ||
        this.data.tab === 'explore' ||
        this.data.route ||
        this.data.routeLoading ||
        this.data.navigating;
      if (shouldKeepCamera()) return;
      const boundary = this.catalog?.campus?.boundary;
      if (!boundary?.length) {
        this.fitBuildingsOnLoad = this.data.loading;
        return;
      }
      this.createSelectorQuery()
        .select('#campus-map')
        .boundingClientRect()
        .exec(([rect]) => {
          if (!shouldKeepCamera() && rect?.width && rect.height)
            this.setData(campusOverview(boundary, rect.width, rect.height));
        });
    },
    watchBuildingFaces() {
      clearInterval(this.buildingTimer);
      void this.loadBuildingFaces();
      this.buildingTimer = setInterval(() => {
        if (this.nativeVisible && this.data.tab !== 'explore') void this.loadBuildingFaces();
      }, 30000);
    },
    async loadBuildingFaces() {
      const request = api.cached('/api/maps/buildings', 30000);
      this.buildingLoad = request;
      try {
        const data = await request;
        if (this.buildingLoad !== request || !this.nativeVisible || !this.data.tilted) return;
        if (this.lastBuildingData !== data || !this.data.buildingFaces.length) {
          this.lastBuildingData = data;
          this.supplementalBuildings = prepareBuildings(data);
          this.paintBuildingFaces();
        }
      } catch (_) {
        // Provider buildings, markers and routing remain usable when the supplement is unavailable.
      }
    },
    paintBuildingFaces() {
      if (this.supplementalBuildings)
        this.setData({
          buildingFaces: buildingFaces(
            this.supplementalBuildings,
            this.mapRotate || 0,
            this.buildingSkew ?? 40,
          ),
        });
    },
    featuresChanged(flags) {
      const feature = flags['map-3d'];
      if (this.data.tilted && (feature?.enabled === false || feature?.visible === false)) {
        clearInterval(this.buildingTimer);
        this.buildingLoad = null;
        this.setData({ tilted: false, buildingFaces: [] });
      }
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
        if (!this.data.route) void this.walk();
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
      const target = this.data.selected;
      if (this.data.routeLoading || this.data.loading || !target || !this.catalog) return;
      if (target.open === false || target.pointOpen === false || target.availability === 'closed') {
        this.setData({ routeError: '这个地点暂时关闭，请选择其他目的地' });
        return;
      }
      this.stopNavigation();
      const serial = this.navSerial;
      this.setData({ routeLoading: true, routeError: '' });
      try {
        const position = await model.location('wgs84');
        if (serial !== this.navSerial) return;
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
        this.setData(
          {
            route,
            polyline: [{ points, color: '#4285dc', width: 5, arrowLine: true }],
            latitude: location.lat,
            longitude: location.lng,
            current: true,
            stepIndex: 0,
            reading: route.steps[0]?.instruction || '请按地图道路前行',
            distanceText: '',
          },
          () => {
            if (serial !== this.navSerial || !points.length) return;
            wx.createMapContext('campus-map', this).includePoints({
              points,
              padding: [36, 36, 36, 36],
            });
          },
        );
      } catch (e) {
        if (serial === this.navSerial)
          this.setData({ routeError: e.message || '步行路线暂不可用' });
      } finally {
        if (serial === this.navSerial) this.setData({ routeLoading: false });
      }
    },
    startNavigation() {
      if (this.data.navigating) {
        this.stopNavigation();
        return;
      }
      if (!this.data.route || this.data.routeLoading) return;
      this.lastSpoken = '';
      this.setData({ navigating: true });
      this.pollNavigation();
    },
    stopNavigation() {
      this.navSerial = (this.navSerial || 0) + 1;
      clearTimeout(this.navTimer);
      this.stopAudio?.();
      this.stopAudio = null;
      this.setData({ navigating: false, voiceBusy: false, routeLoading: false });
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
          compass: Math.round(direction(p, target).bearing),
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
      if (serial === this.navSerial && this.nativeVisible && this.data.navigating)
        this.navTimer = setTimeout(() => this.pollNavigation(), 6000);
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
        if (
          !this.nativeVisible ||
          !this.data.navigating ||
          !this.data.voiceEnabled ||
          serial !== this.navSerial
        ) {
          wx.getFileSystemManager().unlink({ filePath: file, fail() {} });
          return;
        }
        this.stopAudio?.();
        this.stopAudio = voice.play(file);
      } catch (e) {
        api.message(e);
      } finally {
        if (serial === this.navSerial) this.setData({ voiceBusy: false });
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
