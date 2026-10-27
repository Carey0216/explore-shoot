const api = require('../../services/api'),
  painter = require('../../services/atlas');
const origin = () => require('../../services/network').configuredOrigin();
Component(
  require('../../services/localization').component({
    properties: {
      pointId: {
        type: String,
        value: '',
        observer() {
          if (this.mounted) this.load();
        },
      },
      atlas: {
        type: Object,
        value: null,
        observer() {
          if (this.mounted) this.load();
        },
      },
      revealed: { type: Array, value: [] },
      celebrating: { type: Boolean, value: false },
    },
    data: { note: '每次打卡，让一栋校园建筑亮起来', ready: false, canvasHeight: 80 },
    lifetimes: {
      attached() {
        this.mounted = true;
        this.offTheme = require('../../services/appearance').subscribe((d) => {
          this.setData(d);
          if (
            this.progressScope &&
            this.progressScope !== origin() + ':' + (api.session()?.account.id || 'guest')
          )
            this.load();
        });
        this.load();
      },
      detached() {
        this.mounted = false;
        this.serial = (this.serial || 0) + 1;
        this.offTheme?.();
        this.canvas?.cancelAnimationFrame?.(this.frame);
      },
      ready() {
        this.load();
      },
    },
    pageLifetimes: {
      show() {
        if (this.mounted) this.load();
      },
      hide() {
        this.serial = (this.serial || 0) + 1;
        this.canvas?.cancelAnimationFrame?.(this.frame);
      },
    },
    methods: {
      clearProgress() {
        this.setData({ ready: false, note: '每次打卡，让一栋校园建筑亮起来' });
        if (this.canvas) {
          const ctx = this.canvas.getContext('2d');
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          ctx.restore();
        }
      },
      async load() {
        const serial = (this.serial = (this.serial || 0) + 1),
          owner = api.session()?.account.id,
          backend = origin(),
          scope = backend + ':' + (owner || 'guest');
        if (this.progressScope !== scope) this.clearProgress();
        this.progressScope = scope;
        const alive = () =>
          this.mounted &&
          serial === this.serial &&
          backend === origin() &&
          owner === api.session()?.account.id;
        if (!owner || !require('../../services/features').enabled('passport')) {
          this.clearProgress();
          return;
        }
        try {
          const atlas = Array.isArray(this.data.atlas?.buildings)
            ? this.data.atlas
            : (await api.request('/api/my/passport')).atlas;
          if (!alive() || !atlas) return;
          const all = atlas.buildings.filter((b) => b.frame === 'photo'),
            linked = all.filter((b) => b.pointIds.includes(this.data.pointId));
          this.setData({
            note: this.data.pointId
              ? linked.length
                ? linked
                    .map((b) => b.name + (b.collected ? ' · 已点亮' : ' · 打卡后点亮'))
                    .join('，')
                : '留下打卡；楼宇关联正在补充'
              : `已点亮 ${all.filter((b) => b.collected).length} / ${all.length} 栋 · 下一栋在哪里？`,
          });
          wx.nextTick(() =>
            this.createSelectorQuery()
              .select('#collection-atlas')
              .fields({ node: true, size: true })
              .exec((rows) => {
                if (!alive() || !rows?.[0]?.node || !rows[0].width) return;
                const { node: canvas, width } = rows[0];
                this.canvas = canvas;
                const image = canvas.createImage();
                image.onload = () => {
                  if (!alive()) return;
                  let recoil = 0;
                  const cache = {},
                    frame =
                      this.data.celebrating &&
                      this.data.revealed.length &&
                      !this.data.revealed.some((id) => id.startsWith('photo:'))
                        ? 'plan'
                        : 'photo';
                  const draw = (progress) =>
                    painter.draw(
                      canvas,
                      image,
                      atlas,
                      frame,
                      width,
                      wx.getWindowInfo?.().pixelRatio || 1,
                      { ids: this.data.revealed, progress, recoil, cache },
                    );
                  this.setData({ ready: true, canvasHeight: draw(this.data.celebrating ? 0 : 1) });
                  if (this.data.celebrating) {
                    const start = Date.now();
                    let vibrated = false;
                    const tick = () => {
                      if (!alive()) return;
                      const t = Math.min(1, (Date.now() - start) / 700);
                      recoil =
                        t > 0.5 && t < 1 ? Math.sin((t - 0.5) * Math.PI * 8) * (1 - t) * 2 : 0;
                      draw(1 - Math.pow(1 - Math.min(1, t / 0.65), 3));
                      if (t > 0.5 && !vibrated) {
                        vibrated = true;
                        wx.vibrateShort?.({ type: 'light', fail() {} });
                        this.triggerEvent('impact', {}, { bubbles: true, composed: true });
                      }
                      if (t < 1) this.frame = canvas.requestAnimationFrame(tick);
                    };
                    this.frame = canvas.requestAnimationFrame(tick);
                  }
                };
                image.onerror = () => {
                  if (alive()) {
                    this.clearProgress();
                    this.setData({ note: '收集图暂未载入 · 点击重试打开' });
                  }
                };
                image.src = api.asset(
                  this.data.celebrating &&
                    this.data.revealed.length &&
                    !this.data.revealed.some((id) => id.startsWith('photo:'))
                    ? atlas.planURL
                    : atlas.photoURL,
                  false,
                );
              }),
          );
        } catch {
          if (alive()) this.setData({ note: '进度暂未载入 · 点击重试打开收集图' });
        }
      },
      open() {
        this.triggerEvent('navigate');
        if (require('../../services/features').allow('passport') && api.requireLogin())
          wx.navigateTo({ url: '/pages/passport/index' });
      },
    },
  }),
);
