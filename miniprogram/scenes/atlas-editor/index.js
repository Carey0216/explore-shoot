const admin = require('../../services/admin-api'),
  api = require('../../services/api');
const geometry = require('../../services/atlas-geometry');
const { pageOptions } = require('../../services/page');
const clone = (value) => JSON.parse(JSON.stringify(value));
Page(
  pageOptions(
    {
      data: {
        loading: true,
        error: '',
        name: '',
        frameName: '',
        mode: 'pan',
        vertices: 0,
        busy: false,
        changed: false,
      },
      onLoad(query) {
        try {
          this.id = decodeURIComponent(query.id || '');
        } catch (_) {
          this.id = '';
        }
      },
      onShow() {
        this.closed = false;
        if (
          this.shape &&
          this.image &&
          this.canvas &&
          this.owner === admin.session()?.account?.id
        ) {
          this.paint();
          return;
        }
        void this.load();
      },
      onHide() {
        this.closed = true;
        this.serial = (this.serial || 0) + 1;
      },
      onUnload() {
        this.closed = true;
        this.serial = (this.serial || 0) + 1;
      },
      async load() {
        if (admin.session()?.account?.role !== 'owner') {
          this.setData({ loading: false, error: '仅顶级管理员可以重画楼宇轮廓' });
          return;
        }
        const serial = (this.serial = (this.serial || 0) + 1);
        this.setData({ loading: true, error: '' });
        try {
          const data = await admin.request('/passport');
          if (this.closed || this.serial !== serial) return;
          const b = data.atlas.buildings.find((b) => b.id === this.id);
          if (!b) throw Error('楼宇不存在');
          this.atlas = data.atlas;
          this.building = b;
          this.shape = clone({ outline: b.outline, holes: b.holes || [] });
          this.original = clone(this.shape);
          this.history = [];
          this.active = 0;
          this.owner = admin.session()?.account?.id;
          this.setData({
            name: b.name,
            frameName: b.frame === 'photo' ? '俯瞰图' : '楼宇图',
            changed: false,
          });
          wx.nextTick(() =>
            wx
              .createSelectorQuery()
              .in(this)
              .select('#editor-canvas')
              .fields({ node: true, size: true, rect: true })
              .exec((result) => {
                if (this.closed || this.serial !== serial || !result[0]) return;
                this.canvas = result[0].node;
                this.width = result[0].width;
                this.height = result[0].height;
                this.rect = result[0];
                this.ratio = Math.min(2, wx.getWindowInfo().pixelRatio || 1);
                this.canvas.width = this.width * this.ratio;
                this.canvas.height = this.height * this.ratio;
                const image = this.canvas.createImage();
                image.onload = () => {
                  if (this.serial !== serial || this.closed) return;
                  this.image = image;
                  this.focus();
                  this.setData({ loading: false });
                };
                image.onerror = () => {
                  if (this.serial === serial)
                    this.setData({ loading: false, error: '底图加载失败，请重试' });
                };
                image.src = api.asset(
                  b.frame === 'photo' ? data.atlas.photoURL : data.atlas.planURL,
                  false,
                );
              }),
          );
        } catch (e) {
          if (this.serial === serial) this.setData({ loading: false, error: e.message });
        }
      },
      rings() {
        return [this.shape.outline, ...this.shape.holes];
      },
      snapshot() {
        this.history.push({ shape: clone(this.shape), active: this.active, mode: this.data.mode });
        if (this.history.length > 40) this.history.shift();
        this.setData({ changed: true });
      },
      focus() {
        if (!this.shape || !this.width) return;
        const p = this.shape.outline.map((p) =>
          geometry.display(p, this.atlas, this.building.frame),
        );
        const minX = Math.min(...p.map((p) => p[0])),
          minY = Math.min(...p.map((p) => p[1]));
        const maxX = Math.max(...p.map((p) => p[0])),
          maxY = Math.max(...p.map((p) => p[1]));
        this.center = [(minX + maxX) / 2, (minY + maxY) / 2];
        this.scale = Math.min(
          this.width / Math.max(180, maxX - minX + 100),
          this.height / Math.max(140, maxY - minY + 100),
        );
        this.paint();
      },
      screen(p) {
        const d = geometry.display(p, this.atlas, this.building.frame);
        return [
          (d[0] - this.center[0]) * this.scale + this.width / 2,
          (d[1] - this.center[1]) * this.scale + this.height / 2,
        ];
      },
      point(e) {
        const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
        return t
          ? [
              t.x === undefined ? t.clientX - this.rect.left : t.x,
              t.y === undefined ? t.clientY - this.rect.top : t.y,
            ]
          : null;
      },
      source(p) {
        return geometry.source(
          [
            (p[0] - this.width / 2) / this.scale + this.center[0],
            (p[1] - this.height / 2) / this.scale + this.center[1],
          ],
          this.atlas,
          this.building.frame,
        );
      },
      paint() {
        if (!this.canvas || !this.image || this.closed) return;
        const ctx = this.canvas.getContext('2d'),
          a = this.atlas,
          f = this.building.frame;
        ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
        ctx.fillStyle = '#151b20';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.save();
        ctx.translate(
          this.width / 2 - this.center[0] * this.scale,
          this.height / 2 - this.center[1] * this.scale,
        );
        ctx.scale(this.scale, this.scale);
        if (f === 'photo') {
          ctx.translate(0, a.photoWidth);
          ctx.rotate(-Math.PI / 2);
        } else ctx.translate(-85, -112);
        ctx.drawImage(
          this.image,
          0,
          0,
          f === 'photo' ? a.photoWidth : a.planWidth,
          f === 'photo' ? a.photoHeight : a.planHeight,
        );
        ctx.restore();
        this.rings().forEach((ring, i) => {
          ctx.beginPath();
          ring
            .map((p) => this.screen(p))
            .forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p)));
          if (ring.length > 2) ctx.closePath();
          ctx.fillStyle = i ? 'rgba(255,245,220,.25)' : 'rgba(78,154,232,.25)';
          ctx.fill();
          ctx.strokeStyle = i === this.active ? '#ff6597' : '#f4faff';
          ctx.lineWidth = 2;
          ctx.stroke();
          ring.forEach((p) => {
            const s = this.screen(p);
            ctx.beginPath();
            ctx.arc(s[0], s[1], 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#d63670';
            ctx.stroke();
          });
        });
        this.setData({ vertices: this.rings()[this.active]?.length || 0 });
      },
      start(e) {
        if (!this.image || this.data.busy) return;
        const p = this.point(e);
        if (!p) return;
        let vertex = null;
        this.rings().forEach((r, i) =>
          r.forEach((v, j) => {
            const s = this.screen(v);
            if (Math.hypot(s[0] - p[0], s[1] - p[1]) < 18) vertex = [i, j];
          }),
        );
        this.drag = { start: p, last: p, center: [...this.center], vertex };
        if (vertex) this.snapshot();
      },
      move(e) {
        if (!this.drag) return;
        const p = this.point(e);
        if (!p) return;
        const d = this.drag;
        d.last = p;
        if (d.vertex) {
          const [i, j] = d.vertex;
          this.rings()[i][j] = this.source(p);
        } else if (this.data.mode === 'pan') {
          this.center = [
            d.center[0] - (p[0] - d.start[0]) / this.scale,
            d.center[1] - (p[1] - d.start[1]) / this.scale,
          ];
        }
        this.paint();
      },
      end(e) {
        if (!this.drag) return;
        const p = this.point(e) || this.drag.last,
          d = this.drag;
        this.drag = null;
        if (
          !d.vertex &&
          this.data.mode === 'draw' &&
          Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) < 8
        ) {
          this.snapshot();
          this.rings()[this.active].push(this.source(p));
          this.paint();
        }
      },
      cancel() {
        this.drag = null;
      },
      command(e) {
        if (!this.shape || this.data.busy) return;
        const action = e.currentTarget.dataset.action;
        if (action === 'redraw') {
          this.snapshot();
          this.shape = { outline: [], holes: [] };
          this.active = 0;
          this.setData({ mode: 'draw' });
        } else if (action === 'hole') {
          this.snapshot();
          this.shape.holes.push([]);
          this.active = this.shape.holes.length;
          this.setData({ mode: 'draw' });
        } else if (action === 'undo') {
          if (this.history.length) {
            const previous = this.history.pop();
            this.shape = previous.shape;
            this.active = previous.active;
            this.setData({ mode: previous.mode });
          }
        } else if (action === 'reset') {
          this.snapshot();
          this.shape = clone(this.original);
          this.active = 0;
          this.setData({ mode: 'pan' });
        } else if (action === 'focus') {
          this.focus();
          return;
        } else if (action === 'in' || action === 'out') {
          this.scale = Math.max(0.04, Math.min(12, this.scale * (action === 'in' ? 1.4 : 1 / 1.4)));
        } else this.setData({ mode: action === 'draw' ? 'draw' : 'pan' });
        this.paint();
      },
      async save() {
        if (this.data.busy || !this.shape) return;
        if (this.rings().some((r) => r.length < 3)) {
          api.message(Error('每个轮廓至少需要三个顶点，请完成圈画或撤销内院'));
          return;
        }
        this.setData({ busy: true, error: '' });
        try {
          const result = await admin.request('/passport/buildings', 'PUT', {
            id: this.building.id,
            name: this.building.name,
            pointIds: this.building.pointIds,
            revision: this.building.revision,
            ...this.shape,
          });
          this.building = { ...this.building, ...result };
          this.original = clone(this.shape);
          this.history = [];
          this.setData({ changed: false, mode: 'pan' });
          wx.showToast({ title: '已备份并保存', icon: 'success' });
        } catch (e) {
          this.setData({ error: e.message });
        } finally {
          this.setData({ busy: false });
        }
      },
    },
    { administrator: true },
  ),
);
