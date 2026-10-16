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
    },
    onShow() {
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
        this.setData({
          achievements: data.achievements,
          summary: data.summary,
          buildings: data.atlas.buildings.filter((b) => b.frame === this.data.frame),
        });
        wx.nextTick(() => this.drawAtlas());
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    frame(e) {
      this.setData({
        frame: e.currentTarget.dataset.id,
        buildings: this.atlas.buildings.filter((b) => b.frame === e.currentTarget.dataset.id),
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
    async generate() {
      if (this.data.generating) return;
      this.setData({ generating: true });
      wx.createSelectorQuery()
        .in(this)
        .select('#share-card')
        .fields({ node: true })
        .exec((result) => {
          if (!result[0]) {
            this.setData({ generating: false });
            return;
          }
          const canvas = result[0].node,
            ctx = canvas.getContext('2d');
          canvas.width = 750;
          canvas.height = 1000;
          ctx.fillStyle = '#eef2e7';
          ctx.fillRect(0, 0, 750, 1000);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(48, 48, 654, 904);
          ctx.fillStyle = '#9a7848';
          ctx.font = '22px sans-serif';
          ctx.fillText('EXPLORE & SHOOT', 90, 110);
          ctx.fillStyle = '#245b4c';
          ctx.font = 'bold 48px sans-serif';
          ctx.fillText('校园打卡护照', 90, 200);
          ctx.font = '26px sans-serif';
          ctx.fillText(
            `${'已收集地点'}: ${this.data.summary.current || 0} / ${this.data.summary.total || 0}`,
            90,
            280,
            570,
          );
          const earned = this.data.achievements.filter((a) => a.earned);
          earned.slice(0, 6).forEach((a, i) => {
            const x = 190 + (i % 2) * 330,
              y = 400 + Math.floor(i / 2) * 160;
            ctx.beginPath();
            ctx.arc(x, y, 54, 0, Math.PI * 2);
            ctx.fillStyle = '#e9d7aa';
            ctx.fill();
            ctx.fillStyle = '#78603c';
            ctx.font = 'bold 23px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(a.title.length > 10 ? a.title.slice(0, 9) + '…' : a.title, x, y + 90);
          });
          ctx.textAlign = 'left';
          ctx.font = '23px sans-serif';
          ctx.fillStyle = '#78847e';
          ctx.fillText('北方民族大学' + ' · ' + new Date().toLocaleDateString(), 90, 885, 570);
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
