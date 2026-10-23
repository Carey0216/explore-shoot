const api = require('../../services/api'),
  admin = require('../../services/admin-api'),
  { pageOptions } = require('../../services/page');
const presets = [
  'alpine',
  'sea',
  'forest',
  'lake',
  'cat',
  'dog',
  'fox',
  'panda',
  'rabbit',
  'bear',
  'penguin',
  'koala',
  'astronaut',
  'robot',
  'cloud',
  'sprout',
  'anime-sakura',
  'anime-blue',
  'anime-mint',
  'anime-night',
];
Page(
  pageOptions({
    data: { presets, image: false, zoom: 100, busy: false, error: '', administrator: false },
    onLoad(o) {
      this.asAdmin = o.admin === '1';
      this.setData({ administrator: this.asAdmin });
      this.owner = this.client().session()?.account.id;
      if (!this.owner) {
        if (this.asAdmin) wx.redirectTo({ url: '/pages/admin/index' });
        else api.requireLogin();
      }
    },
    client() {
      return this.asAdmin ? admin : api;
    },
    async choose() {
      if (this.data.busy) return;
      try {
        const src = await require('../../services/photo').choose(),
          found = await new Promise((resolve) =>
            this.createSelectorQuery()
              .select('#avatar-canvas')
              .fields({ node: true, size: true })
              .exec((r) => resolve(r[0])),
          );
        if (!found?.node) throw Error('头像画布暂不可用');
        this.canvas = found.node;
        this.canvas.width = this.canvas.height = 512;
        this.displayWidth = found.width;
        const image = this.canvas.createImage();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(Error('照片无法读取，请换一张'));
          image.src = src;
        });
        this.source = image;
        this.offset = { x: 0, y: 0 };
        this.setData({ image: true, zoom: 100, error: '' });
        this.draw();
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) this.setData({ error: e.message || '照片选择失败' });
      }
    },
    draw() {
      if (!this.source || !this.canvas) return;
      const ctx = this.canvas.getContext('2d'),
        im = this.source,
        scale = (Math.max(512 / im.width, 512 / im.height) * this.data.zoom) / 100,
        w = im.width * scale,
        h = im.height * scale;
      this.offset.x = Math.max(-(w - 512) / 2, Math.min((w - 512) / 2, this.offset.x));
      this.offset.y = Math.max(-(h - 512) / 2, Math.min((h - 512) / 2, this.offset.y));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(im, (512 - w) / 2 + this.offset.x, (512 - h) / 2 + this.offset.y, w, h);
    },
    zoom(e) {
      this.setData({ zoom: Number(e.detail.value) });
      this.draw();
    },
    start(e) {
      this.last = e.touches[0];
    },
    move(e) {
      if (!this.source || !this.last || this.data.busy) return;
      const p = e.touches[0],
        factor = 512 / this.displayWidth;
      this.offset.x += (p.x - this.last.x) * factor;
      this.offset.y += (p.y - this.last.y) * factor;
      this.last = p;
      this.draw();
    },
    async save() {
      if (!this.source || this.data.busy) return;
      this.setData({ busy: true, error: '' });
      try {
        const file = await new Promise((resolve, reject) =>
            wx.canvasToTempFilePath(
              {
                canvas: this.canvas,
                fileType: 'jpg',
                quality: 0.82,
                success: (r) => resolve(r.tempFilePath),
                fail: reject,
              },
              this,
            ),
          ),
          avatar = await require('../../services/photo').dataURL(file);
        await this.commit({ avatar });
      } catch (e) {
        this.setData({ error: e.message || '头像保存失败' });
      } finally {
        this.setData({ busy: false });
      }
    },
    async preset(e) {
      if (this.data.busy) return;
      this.setData({ busy: true, error: '' });
      try {
        await this.commit({ avatarPreset: e.currentTarget.dataset.id });
      } catch (err) {
        this.setData({ error: err.message });
      } finally {
        this.setData({ busy: false });
      }
    },
    async commit(body) {
      const client = this.client();
      if (this.owner !== client.session()?.account.id) throw Error('账号已改变，请重新打开');
      const r = await client.request(
        this.asAdmin ? '/auth/profile' : '/api/auth/profile',
        'PATCH',
        body,
      );
      if (this.owner !== client.session()?.account.id) return;
      client.updateAccount(r.account);
      api.message('头像已更新');
      wx.navigateBack();
    },
  }),
);
