const api = require('../../services/api'),
  painter = require('../../services/atlas');
const origin = () => require('../../services/network').configuredOrigin();
Component(
  require('../../services/localization').component({
    properties: {
      impact: Boolean,
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
      cinematic: { type: Boolean, value: false },
      revisit: { type: Boolean, value: false },
    },
    data: {
      note: '每次打卡，让一栋校园建筑亮起来',
      ready: false,
      canvasHeight: 80,
      active: true,
      thumbnail: '',
      thumbnailRenderFailed821: false,
    },
    lifetimes: {
      attached() {
        this.mounted = true;
        this.visible = true;
        this.offTheme = require('../../services/appearance').subscribe((d) => {
          this.setData(d);
          if (
            this.progressScope &&
            this.progressScope !== origin() + ':' + (api.session()?.account.id || 'guest')
          ) {
            this.clearProgress();
            this.load();
          }
        });
        this.load();
      },
      detached() {
        this.mounted = false;
        this.visible = false;
        this.serial = (this.serial || 0) + 1;
        this.offTheme?.();
        this.canvas?.cancelAnimationFrame?.(this.frame);
      },
      ready() {
        this.load();
      },
    },
    pageLifetimes: {
      resize(event) {
        require('../../services/viewport').update(event);
        if (this.visible && this.data.cinematic) this.resizeCinema821();
      },
      show() {
        this.visible = true;
        if (this.mounted) this.load();
        this.setData({ active: true });
      },
      hide() {
        this.visible = false;
        this.serial = (this.serial || 0) + 1;
        this.canvas?.cancelAnimationFrame?.(this.frame);
        this.setData({ active: false });
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
        this.cinemaCache814 = null;
        this.cinemaImage814 = null;
        this.cinemaAlive814 = null;
        this.thumbnailSignature821 = '';
        this.setData({
          ready: false,
          thumbnail: '',
          thumbnailRenderFailed821: false,
          litCount: 0,
          buildingCount: 0,
          note: '每次打卡，让一栋校园建筑亮起来',
        });
        if (this.canvas) {
          const ctx = this.canvas.getContext('2d');
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          ctx.restore();
        }
      },
      async load() {
        if (!this.mounted || !this.visible) return;
        const serial = (this.serial = (this.serial || 0) + 1),
          owner = api.session()?.account.id,
          backend = origin(),
          scope = backend + ':' + (owner || 'guest');
        if (this.progressScope !== scope) this.clearProgress();
        this.progressScope = scope;
        const alive = () =>
          this.mounted &&
          this.visible &&
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
            ...(this.data.cinematic
              ? { stageHeight: require('../../services/viewport').snapshot().windowHeight }
              : {}),
            litCount: all.filter((b) => b.collected).length,
            buildingCount: all.length,
            note: this.data.pointId
              ? linked.length
                ? linked
                    .map((b) => b.name + (b.collected ? ' · 已点亮' : ' · 打卡后点亮'))
                    .join('，')
                : '留下打卡；楼宇关联正在补充'
              : `已点亮 ${all.filter((b) => b.collected).length} / ${all.length} 栋 · 下一栋在哪里？`,
          });
          const still = !this.data.cinematic && !this.data.celebrating;
          const signature = still
            ? JSON.stringify([
                atlas.photoURL,
                all.map((b) => [b.id, b.collected, b.outline, b.holes]),
              ])
            : '';
          if (still && this.data.thumbnail && signature === this.thumbnailSignature821) return;
          if (still) this.setData({ thumbnail: '', ready: false, thumbnailRenderFailed821: false });
          wx.nextTick(() =>
            this.createSelectorQuery()
              .select(this.data.cinematic ? '#collection-cinema814' : '#collection-atlas')
              .fields({ node: true, size: true })
              .exec((rows) => {
                if (!alive() || !rows?.[0]?.node || !rows[0].width) return;
                const { node: canvas, width } = rows[0];
                this.canvas = canvas;
                const image = canvas.createImage();
                image.onload = () => {
                  if (!alive()) return;
                  if (this.data.cinematic) {
                    this.playCinema(canvas, image, atlas, alive);
                    return;
                  }
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
                  this.setData({
                    ready: !still,
                    canvasHeight: draw(this.data.celebrating ? 0 : 1),
                  });
                  if (still) {
                    // A normal entry is a bitmap, not a retained native canvas layer.
                    // This prevents the old page's small map painting over a new page.
                    wx.canvasToTempFilePath(
                      {
                        canvas,
                        fileType: 'png',
                        success: (result) => {
                          if (!alive()) return;
                          this.thumbnailSignature821 = signature;
                          this.setData({ thumbnail: result.tempFilePath, ready: true });
                        },
                        fail: () => {
                          if (alive())
                            this.setData({ thumbnailRenderFailed821: true, ready: false });
                        },
                      },
                      this,
                    );
                    return;
                  }
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
      offscreen815() {
        try {
          return wx.createOffscreenCanvas?.({ type: '2d', width: 1, height: 1 });
        } catch {
          return undefined;
        }
      },
      playCinema(canvas, image, atlas, alive) {
        const cinema = require('../../services/collection-cinema'),
          info = require('../../services/viewport').snapshot(),
          width = info.windowWidth,
          height = info.windowHeight;
        let start = Date.now();
        const cache =
          this.cinemaCache814 ||
          (this.cinemaCache814 = {
            surface: this.offscreen815(),
            frameSurface: this.offscreen815(),
          });
        this.cinemaImage814 = image;
        this.cinemaAtlas814 = atlas;
        this.cinemaAlive814 = alive;
        const run = (this.cinemaRun814 = (this.cinemaRun814 || 0) + 1);
        canvas.cancelAnimationFrame?.(this.frame);
        let impacted = false,
          presented = false;
        const measured = require('../../services/experience-metrics').start('landing');
        let previous = Date.now(),
          gaps = 0,
          ticks = 0;
        this.landingStartedAt = start;
        this.landingFrameCount = 0;
        const first = cinema.render(
          canvas,
          image,
          atlas,
          this.revealIds(),
          width,
          height,
          info.pixelRatio,
          0,
          cache,
        );
        if (!first) return;
        const resultTop = Math.min(height - 220, first.layout.map.y + first.layout.map.height + 24);
        start = Date.now();
        this.landingStartedAt = start;
        this.setData({ ready: true, stageHeight: height });
        this.triggerEvent('phase', { ready: true, landed: false, resultTop });
        const tick = () => {
          if (!alive() || run !== this.cinemaRun814) return;
          const elapsed = Date.now() - start;
          const now = Date.now();
          if (now - previous > 34) gaps++;
          previous = now;
          ticks++;
          this.landingFrameCount++;
          const size = require('../../services/viewport').snapshot();
          const frame = cinema.render(
            canvas,
            image,
            atlas,
            this.revealIds(),
            size.windowWidth,
            size.windowHeight,
            size.pixelRatio,
            elapsed,
            cache,
          );
          this.cinemaFrame = frame;
          this.landingPose = frame?.pose;
          if (elapsed >= cinema.impactAt && !impacted) {
            impacted = true;
            this.landingImpactAt = Date.now();
            wx.vibrateShort?.({ type: 'heavy', fail() {} });
            this.triggerEvent('impact');
          }
          if (elapsed >= cinema.impactAt + 240 && !presented) {
            presented = true;
            this.triggerEvent('phase', {
              ready: true,
              landed: true,
              resultTop: Math.min(
                size.windowHeight - 220,
                frame.layout.map.y + frame.layout.map.height + 24,
              ),
            });
          }
          if (elapsed < cinema.duration) this.frame = canvas.requestAnimationFrame(tick);
          else measured(true, { dropped: gaps / Math.max(1, ticks) });
        };
        this.frame = canvas.requestAnimationFrame(tick);
      },
      replayCinema() {
        if (this.cinemaImage814 && this.cinemaAlive814?.())
          this.playCinema(
            this.canvas,
            this.cinemaImage814,
            this.cinemaAtlas814,
            this.cinemaAlive814,
          );
        else this.load();
      },
      resizeCinema821() {
        if (!this.cinemaImage814 || !this.cinemaAlive814?.()) return;
        const size = require('../../services/viewport').snapshot(),
          cinema = require('../../services/collection-cinema');
        this.setData({ stageHeight: size.windowHeight });
        const elapsed = Math.min(cinema.duration, Date.now() - this.landingStartedAt);
        const frame = cinema.render(
          this.canvas,
          this.cinemaImage814,
          this.cinemaAtlas814,
          this.revealIds(),
          size.windowWidth,
          size.windowHeight,
          size.pixelRatio,
          elapsed,
          this.cinemaCache814,
        );
        if (frame)
          this.triggerEvent('phase', {
            ready: true,
            landed: elapsed >= cinema.impactAt + 240,
            resultTop: Math.min(
              size.windowHeight - 220,
              frame.layout.map.y + frame.layout.map.height + 24,
            ),
          });
      },
      open() {
        this.triggerEvent('navigate');
        if (require('../../services/features').allow('passport') && api.requireLogin())
          wx.navigateTo({ url: '/pages/passport/index' });
      },
    },
  }),
);
