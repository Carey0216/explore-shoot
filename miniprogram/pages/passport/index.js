const { cardStyles, drawPassportCard } = require('../../services/passport-card-art');
const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const atlasPainter = require('../../services/atlas');
Page(
  pageOptions({
    data: {
      achievements: [],
      summary: {},
      buildings: [],
      frame: 'photo',
      atlasHeight: 200,
      loading: false,
      error: '',
      atlasError: '',
      card: '',
      generating: false,
      canSave: false,
      style: 0,
      styleName: cardStyles[0][0],
      selectedBuilding: null,
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
    },
    async load() {
      this.setData({ loading: true, error: '', atlasError: '' });
      try {
        const data = await api.request('/api/my/passport');
        this.atlas = data.atlas;
        const achievements = data.achievements.map((a) => ({
          ...a,
          badge: api.asset('/shared/badges/' + (a.badgePreset || 'badge-01') + '.png', false),
        }));
        this.setData({
          achievements,
          achievementColumns: [
            achievements.filter((_, i) => i % 2 === 0),
            achievements.filter((_, i) => i % 2 === 1),
          ],
          summary: data.summary,
          milestones: (data.milestones || []).map((m) => ({
            ...m,
            badge: api.asset('/shared/badges/' + m.badgePreset + '.png', false),
          })),
          buildings: data.atlas.buildings.filter((b) => b.frame === this.data.frame),
        });
        const next =
          data.atlas.buildings.find((b) => b.id === this.requestedBuilding) ||
          data.atlas.buildings.find(
            (b) => b.frame === 'photo' && !b.collected && b.pointIds.length,
          );
        if (next) {
          this.setData({
            frame: next.frame,
            buildings: data.atlas.buildings.filter((b) => b.frame === next.frame),
          });
          this.selectBuilding(next.id);
        }
        wx.nextTick(() => this.drawAtlas());
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    timeline() {
      wx.navigateTo({ url: '/pages/timeline/index' });
    },
    milestoneNext(e) {
      const id = e.currentTarget.dataset.id;
      if (id) wx.navigateTo({ url: '/pages/detail/index?id=' + encodeURIComponent(id) });
    },
    frame(e) {
      this.setData({
        frame: e.currentTarget.dataset.id,
        buildings: this.atlas.buildings.filter((b) => b.frame === e.currentTarget.dataset.id),
        selectedBuilding: null,
      });
      this.drawAtlas();
    },
    drawAtlas() {
      if (!this.atlas) return;
      const frame = this.data.frame;
      wx.createSelectorQuery()
        .in(this)
        .select('#atlas')
        .fields({ node: true, size: true })
        .exec((result) => {
          if (!result[0] || this.disposed) return;
          const { node: canvas, width } = result[0];
          this.atlasWidth = width;
          const image = canvas.createImage();
          image.onload = () => {
            if (this.disposed || this.data.frame !== frame) return;
            try {
              const info = wx.getWindowInfo();
              const height = atlasPainter.draw(
                canvas,
                image,
                this.atlas,
                frame,
                width,
                info.pixelRatio,
              );
              this.setData({ atlasHeight: height, atlasError: '' });
            } catch (_) {
              this.setData({ atlasError: '楼宇图绘制失败，可继续查看下方收集列表' });
            }
          };
          image.onerror = () => this.setData({ atlasError: '楼宇底图加载失败，请检查网络后重试' });
          try {
            image.src = api.asset(
              frame === 'photo' ? this.atlas.photoURL : this.atlas.planURL,
              false,
            );
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
      this.setData({ selectedBuilding: b });
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
    changeStyle() {
      this.setData({
        style: (this.data.style + 1) % cardStyles.length,
        styleName: cardStyles[(this.data.style + 1) % cardStyles.length][0],
      });
      void this.generate();
    },
    async generate() {
      if (this.data.generating) return;
      this.setData({ generating: true });
      wx.createSelectorQuery()
        .in(this)
        .select('#share-card')
        .fields({ node: true })
        .exec(async (result) => {
          if (!result[0]) {
            this.setData({ generating: false });
            return;
          }
          const canvas = result[0].node;
          canvas.width = 1080;
          canvas.height = 1350;
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
          if (this.disposed) {
            return;
          }
          drawPassportCard(
            canvas.getContext('2d'),
            this.data.summary,
            earned,
            this.data.style,
            images,
          );
          wx.canvasToTempFilePath(
            {
              canvas,
              fileType: 'png',
              success: (r) => this.setData({ card: r.tempFilePath, canSave: true }),
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
    save() {
      if (!this.data.card) return;
      wx.saveImageToPhotosAlbum({
        filePath: this.data.card,
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
