const {
  cardStyles,
  drawPassportCard,
  drawCampusShareFooter,
  shareFooterHeight,
  campusCodeAreas,
} = require('../../services/passport-card-art');
const { campusShareCodes } = require('../../services/share-codes');
const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const atlasPainter = require('../../services/atlas');
const design = require('../../services/design-tokens');
const { nearestCollectionBuilding } = require('../../services/collection-distance');
Page(
  pageOptions({
    data: {
      achievements: [],
      summary: {},
      buildings: [],
      buildingLimit: 5,
      frame: 'photo',
      atlasHeight: 200,
      atlasBackdrop: '',
      loading: false,
      error: '',
      atlasError: '',
      card: '',
      cardCodes: [],
      generating: false,
      canSave: false,
      style: 0,
      styleName: cardStyles[0][0],
      selectedBuilding: null,
      recommendation: null,
      locatingRecommendation: false,
    },
    onLoad(options) {
      this.requestedBuilding = options.building || '';
    },
    onShow() {
      this.disposed = false;
      if (api.requireLogin()) this.load();
    },
    onUnload() {
      this.disposed = true;
      this.atlasImage821 = null;
      this.atlasPixels821 = null;
    },
    async load() {
      const request = (this.passportRequest = (this.passportRequest || 0) + 1);
      const owner = api.identity();
      const active = () =>
        !this.disposed &&
        this.nativeVisible &&
        request === this.passportRequest &&
        owner === api.identity();
      this.setData({ loading: true, error: '', atlasError: '' });
      try {
        const data = await api.request('/api/my/passport');
        if (!active()) return;
        const needsCatalog = data.atlas.buildings.some(
          (building) => building.pointIds?.length && !Array.isArray(building.points),
        );
        const catalog = needsCatalog ? await api.cached('/api/catalog').catch(() => null) : null;
        if (!active()) return;
        const published = new Map((catalog?.points || []).map((point) => [point.id, point]));
        const buildings = data.atlas.buildings.map((building) => {
          if (Array.isArray(building.points)) return building;
          const points = (building.pointIds || []).flatMap((id) => {
            const point = published.get(id);
            return point ? [{ id, name: point.name, open: point.open === true }] : [];
          });
          return {
            ...building,
            points,
            displayName: points[0]?.name || building.name,
            pointLookupFailed: Boolean(building.pointIds?.length && !catalog),
          };
        });
        this.atlas = { ...data.atlas, buildings };
        this.nextBuildings = data.nextBuildings || [];
        const achievements = data.achievements.map((a) => ({
          ...a,
          badge: api.asset('/shared/badges/' + (a.badgePreset || 'badge-01') + '.png', false),
        }));
        const selectedId = this.requestedBuilding || this.data.selectedBuilding?.id;
        const next =
          buildings.find((b) => b.id === selectedId) ||
          (!this.atlasFrameChosen &&
            (buildings.find((b) => b.id === this.nextBuildings[0]?.buildingId) ||
              buildings.find(
                (b) => b.frame === 'photo' && !b.collected && b.points?.some((point) => point.open),
              ))) ||
          null;
        this.requestedBuilding = '';
        const frame = next?.frame || this.data.frame;
        this.setData({
          achievements,
          achievementColumns: [
            achievements.filter((_, i) => i % 2 === 0),
            achievements.filter((_, i) => i % 2 === 1),
          ],
          summary: data.summary,
          recommendation: this.nextBuildings[0] || null,
          milestones: (data.milestones || []).map((m) => ({
            ...m,
            badge: api.asset('/shared/badges/' + m.badgePreset + '.png', false),
          })),
          frame,
          buildings: buildings.filter((b) => b.frame === frame),
          selectedBuilding: next,
        });
        wx.nextTick(() => this.drawAtlas());
      } catch (e) {
        if (active()) this.setData({ error: e.message });
      } finally {
        if (active()) this.setData({ loading: false });
      }
    },
    timeline() {
      wx.navigateTo({ url: '/pages/timeline/index' });
    },
    milestoneNext(e) {
      const id = e.currentTarget.dataset.id;
      if (id) wx.navigateTo({ url: '/pages/detail/index?id=' + encodeURIComponent(id) });
    },
    showRecommendation() {
      const building = this.atlas?.buildings.find(
        (item) => item.id === this.data.recommendation?.buildingId,
      );
      if (!building) return;
      this.setData(
        {
          frame: building.frame,
          buildings: this.atlas.buildings.filter((item) => item.frame === building.frame),
          buildingLimit: 5,
          selectedBuilding: building,
        },
        () => {
          this.drawAtlas();
          this.revealBuilding();
        },
      );
    },
    async recommendNearby() {
      const candidates = this.nextBuildings;
      this.setData({ locatingRecommendation: true });
      try {
        const fix = await require('../../services/model').location();
        if (this.disposed || !this.nativeVisible || candidates !== this.nextBuildings) return;
        const result =
          fix.accuracy > 100 ? null : nearestCollectionBuilding(candidates, fix.lng, fix.lat);
        if (!result) throw Error('未取得可用的位置');
        this.setData({ recommendation: result }, () => this.showRecommendation());
      } catch {
        if (this.nativeVisible)
          wx.showToast({
            title:
              this.data.locale === 'en-US'
                ? 'Location unavailable'
                : '未取得当前位置，已保留原推荐',
            icon: 'none',
          });
      } finally {
        if (!this.disposed) this.setData({ locatingRecommendation: false });
      }
    },
    frame(e) {
      this.atlasFrameChosen = true;
      this.setData({
        buildingLimit: 5,
        frame: e.currentTarget.dataset.id,
        buildings: this.atlas.buildings.filter((b) => b.frame === e.currentTarget.dataset.id),
        selectedBuilding: null,
      });
      this.drawAtlas();
    },
    moreBuildings() {
      this.setData({
        buildingLimit: Math.min(this.data.buildings.length, this.data.buildingLimit + 5),
      });
    },
    drawAtlas() {
      if (!this.atlas) return;
      const frame = this.data.frame;
      wx.createSelectorQuery()
        .in(this)
        .select('#atlas')
        .fields({ node: true, size: true })
        .exec((result) => {
          if (!result[0] || this.disposed || !this.nativeVisible) return;
          const { node: canvas, width } = result[0];
          this.atlasWidth = width;
          const source = api.asset(
            frame === 'photo' ? this.atlas.photoURL : this.atlas.planURL,
            false,
          );
          const paint = (image) => {
            if (this.disposed || !this.nativeVisible || this.data.frame !== frame) return;
            try {
              const info = require('../../services/viewport').snapshot();
              const height = atlasPainter.draw(
                canvas,
                image,
                this.atlas,
                frame,
                width,
                info.pixelRatio,
                {
                  selectedId: this.data.selectedBuilding?.id,
                  selection: design[this.data.themeDark ? 'dark' : 'light'],
                  cache: this.atlasPixels821 || (this.atlasPixels821 = {}),
                },
              );
              this.setData({ atlasHeight: height, atlasError: '', atlasBackdrop: source });
            } catch (_) {
              this.setData({ atlasError: '楼宇图绘制失败，可继续查看下方收集列表' });
            }
          };
          if (this.atlasImage821?.canvas === canvas && this.atlasImage821.source === source) {
            paint(this.atlasImage821.image);
            return;
          }
          const image = canvas.createImage();
          image.onload = () => {
            if (this.disposed || !this.nativeVisible || this.data.frame !== frame) return;
            this.atlasImage821 = { canvas, source, image };
            paint(image);
          };
          image.onerror = () => this.setData({ atlasError: '楼宇底图加载失败，请检查网络后重试' });
          try {
            image.src = source;
          } catch (e) {
            this.setData({ atlasError: e.message });
          }
        });
    },
    atlasTap(e) {
      if (!this.atlasWidth || !this.atlas) return;
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      const b = require('../../services/atlas-geometry').hit(
        this.atlas,
        this.data.frame,
        touch.x,
        touch.y,
        this.atlasWidth,
      );
      if (b) this.selectBuilding(b.id);
    },
    buildingTap(e) {
      this.selectBuilding(e.currentTarget.dataset.id);
    },
    selectBuilding(id) {
      const b = this.atlas?.buildings.find((b) => b.id === id);
      if (!b) return;
      this.setData({ selectedBuilding: b }, () => {
        this.drawAtlas();
        this.revealBuilding();
      });
    },
    revealBuilding() {
      const query = this.createSelectorQuery();
      query.select('#atlas-building-guide').boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec(([card, viewport]) => {
        if (!card || !viewport || !this.nativeVisible) return;
        const height = require('../../services/viewport').snapshot().windowHeight;
        const bottom = card.top + Math.min(card.height, 210);
        const shift = card.top < 12 ? card.top - 12 : Math.max(0, bottom - height + 24);
        if (shift)
          wx.pageScrollTo({ scrollTop: Math.max(0, viewport.scrollTop + shift), duration: 220 });
      });
    },
    onResize(event) {
      require('../../services/viewport').update(event);
      if (this.nativeVisible && this.atlas) this.drawAtlas();
    },
    buildingPoint(e) {
      wx.navigateTo({
        url: '/pages/detail/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
    buildingRoute(e) {
      getApp().globalData.destination = e.currentTarget.dataset.id;
      getApp().globalData.mapTab = 'navigation';
      wx.switchTab({ url: '/pages/map/index' });
    },
    buildingCheckin(e) {
      wx.navigateTo({
        url: '/pages/checkin/index?point=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
    dismissPassportReward() {
      this.dismissNativeRewards812();
      wx.nextTick(() => this.drawAtlas());
    },
    changeStyle() {
      this.setData({
        style: (this.data.style + 1) % cardStyles.length,
        styleName: cardStyles[(this.data.style + 1) % cardStyles.length][0],
      });
      void this.generate();
    },
    async generate() {
      if (this.data.generating) return;
      const identity = api.identity();
      this.setData({ generating: true });
      wx.createSelectorQuery()
        .in(this)
        .select('#share-card')
        .fields({ node: true })
        .exec(async (result) => {
          if (this.disposed) return;
          if (api.identity() !== identity) return this.setData({ generating: false });
          if (!result[0]) {
            this.setData({ generating: false });
            return;
          }
          const canvas = result[0].node;
          canvas.width = 1080;
          canvas.height = 1350 + shareFooterHeight;
          const codes = campusShareCodes(canvas).catch(() => ({}));
          const earned = this.data.achievements.filter((a) => a.earned);
          const images = await Promise.all(
            earned.slice(0, 6).map(
              (a) =>
                new Promise((resolve) => {
                  const image = canvas.createImage();
                  image.onload = () => resolve(image);
                  image.onerror = () => resolve(null);
                  image.src = a.badge;
                }),
            ),
          );
          const shareCodes = await codes;
          if (this.disposed) return;
          if (api.identity() !== identity) return this.setData({ generating: false });
          const context = canvas.getContext('2d');
          drawPassportCard(context, this.data.summary, earned, this.data.style, images);
          drawCampusShareFooter(context, canvas.width, 1350, shareCodes);
          wx.canvasToTempFilePath(
            {
              canvas,
              fileType: 'png',
              success: (r) => {
                if (!this.disposed && api.identity() === identity)
                  this.setData({
                    card: r.tempFilePath,
                    cardCodes: campusCodeAreas(canvas.width, 1350, shareCodes),
                    canSave: true,
                  });
              },
              fail: () => api.message(Error('分享卡生成失败')),
              complete: () => this.setData({ generating: false }),
            },
            this,
          );
        });
    },
    scene() {
      if (!require('../../services/features').allow('campus-3d')) return;
      wx.navigateTo({ url: '/scenes/campus/index?mode=passport' });
    },
    async save() {
      if (!this.data.card || this.data.generating) return;
      const identity = api.identity();
      let file;
      try {
        file = await this.selectComponent('#passport-art')?.file();
      } catch (error) {
        api.message(error);
        return;
      }
      if (!file || this.disposed || identity !== api.identity()) return;
      wx.saveImageToPhotosAlbum({
        filePath: file,
        success() {
          wx.showToast({ title: '已保存', icon: 'success' });
        },
        fail() {
          api.message(Error('未保存，可授权相册权限后重试'));
        },
      });
    },
  }),
);
