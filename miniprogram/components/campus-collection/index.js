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
      revealKey: {
        type: String,
        value: '',
        observer() {
          if (this.mounted) this.load();
        },
      },
      celebrating: { type: Boolean, value: false },
      revisit: { type: Boolean, value: false },
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
      revealIds() {
        return this.data.revealKey
          ? this.data.revealKey.split(',').filter(Boolean)
          : Array.isArray(this.data.revealed)
            ? this.data.revealed
            : Object.values(this.data.revealed || {});
      },
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
                  let recoil = 0,
                    landingPose;
                  const cache = {},
                    frame =
                      this.data.celebrating &&
                      this.revealIds().length &&
                      !this.revealIds().some((id) => id.startsWith('photo:'))
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
                      { ids: this.revealIds(), progress, recoil, cache, pose: landingPose },
                    );
                  this.setData({ ready: true, canvasHeight: draw(this.data.celebrating ? 0 : 1) });
                  if (this.data.celebrating) {
                    const start = Date.now();
                    this.landingStartedAt = start;
                    this.landingFrameCount = 0;
                    let vibrated = false;
                    const tick = () => {
                      if (!alive()) return;
                      const motion = require('../../services/landing-motion');
                      const elapsed = Date.now() - start,
                        t = Math.min(1, elapsed / motion.duration);
                      landingPose = motion.pose(elapsed);
                      this.landingPose = landingPose;
                      this.landingFrameCount++;
                      recoil = landingPose.recoil;
                      draw(Math.min(1, t / 0.54));
                      if (landingPose.landed && !vibrated) {
                        this.landingImpactAt = Date.now();
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
                    this.revealIds().length &&
                    !this.revealIds().some((id) => id.startsWith('photo:'))
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
