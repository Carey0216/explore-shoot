const api = require('../../services/api'),
  { pageOptions } = require('../../services/page'),
  { qrcodegen } = require('../../services/qrcodegen');
function text(ctx, value, x, y, width, line = 36, max = 3) {
  let row = '',
    count = 0;
  for (const c of String(value || '')) {
    if (ctx.measureText(row + c).width > width && row) {
      ctx.fillText(row, x, y);
      row = c;
      y += line;
      if (++count >= max) return;
    } else row += c;
  }
  if (row) ctx.fillText(row, x, y);
}
Page(
  pageOptions({
    data: { point: null, poster: '', preview: false, busy: false, error: '', albumDenied: false },
    onLoad(o) {
      this.id = o.id;
      if (o.from === 'timeline')
        return wx.redirectTo({ url: '/pages/detail/index?id=' + encodeURIComponent(this.id) });
      this.load();
    },
    async load() {
      try {
        const r = await api.cached('/api/catalog');
        const p = r.points.find((p) => p.id === this.id);
        if (!p) throw Error('地点已下线或不存在');
        this.setData({ point: require('../../services/model').pointView(p) });
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    url() {
      if (!/^[a-z0-9-]{1,60}$/i.test(this.id)) throw Error('地点编号无效');
      return (
        require('../../services/network').configuredOrigin() +
        '/#place/' +
        encodeURIComponent(this.id) +
        '?shared=1'
      );
    },
    copy() {
      wx.setClipboardData({
        data: this.url(),
        success: () => wx.showToast({ title: '链接已复制', icon: 'none', duration: 1800 }),
      });
    },
    qq() {
      wx.setClipboardData({
        data: this.url(),
        success: () =>
          wx.showToast({ title: '链接已复制，可粘贴给QQ好友', icon: 'none', duration: 2500 }),
      });
    },
    close() {
      wx.navigateBack();
    },
    closePreview() {
      this.setData({ preview: false });
    },
    noop() {},
    async generate() {
      if (this.data.busy || !this.data.point) return;
      if (this.data.poster) return this.setData({ preview: true });
      this.setData({ busy: true, error: '' });
      const owner = api.session()?.account.id;
      try {
        const node = await new Promise((resolve) =>
          wx
            .createSelectorQuery()
            .in(this)
            .select('#point-poster')
            .fields({ node: true, size: true })
            .exec((r) => resolve(r[0]?.node)),
        );
        if (!node) throw Error('绘图暂不可用，请重试');
        node.width = 900;
        node.height = 1200;
        const ctx = node.getContext('2d');
        const dark = this.data.themeDark;
        ctx.fillStyle = dark ? '#15181f' : '#f5f6ee';
        ctx.fillRect(0, 0, 900, 1200);
        ctx.fillStyle = dark ? '#d9e6ef' : '#254d60';
        ctx.font = 'bold 29px sans-serif';
        const wordmark = node.createImage();
        await new Promise((resolve, reject) => {
          wordmark.onload = resolve;
          wordmark.onerror = () => reject(Error('标志加载失败，请重试'));
          wordmark.src = '/assets/brand/jingyu-' + (dark ? 'dark' : 'light') + '.png';
        });
        ctx.drawImage(wordmark, 48, 8, 180, 90);
        const path = await api.download(this.data.point.photo, false);
        const image = node.createImage();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(Error('地点照片暂不可用'));
          image.src = path;
        });
        if (owner !== api.session()?.account.id) throw Error('账号已改变，请重新生成');
        const scale = Math.max(804 / image.width, 520 / image.height),
          w = image.width * scale,
          h = image.height * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(48, 110, 804, 520);
        ctx.clip();
        ctx.drawImage(image, 48 + (804 - w) / 2, 110 + (520 - h) / 2, w, h);
        ctx.restore();
        ctx.fillStyle = dark ? '#e1e8ef' : '#25374a';
        ctx.font = 'bold 42px sans-serif';
        text(ctx, this.data.point.name, 48, 700, 804, 54, 2);
        ctx.fillStyle = dark ? '#aabac8' : '#6e808b';
        ctx.font = '25px sans-serif';
        text(ctx, this.data.point.description, 48, 825, 804, 39, 3);
        const qr = qrcodegen.QrCode.encodeText(this.url(), qrcodegen.QrCode.Ecc.MEDIUM),
          size = 186,
          cell = size / (qr.size + 8);
        ctx.fillStyle = '#fff';
        ctx.fillRect(48, 958, size, size);
        ctx.fillStyle = dark ? '#d9e6ef' : '#132e40';
        for (let y = 0; y < qr.size; y++)
          for (let x = 0; x < qr.size; x++)
            if (qr.getModule(x, y))
              ctx.fillRect(
                48 + (x + 4) * cell,
                958 + (y + 4) * cell,
                Math.ceil(cell),
                Math.ceil(cell),
              );
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText('扫码，打开这个地点', 270, 1020);
        ctx.font = '22px sans-serif';
        ctx.fillStyle = dark ? '#aabac8' : '#6e808b';
        ctx.fillText('看机位 · 找路线 · 留下自己的校园发现', 270, 1068);
        ctx.fillText('地点公开资料 · 不包含私人打卡或定位', 270, 1110);
        const file = await new Promise((resolve, reject) =>
          wx.canvasToTempFilePath(
            {
              canvas: node,
              fileType: 'png',
              success: (r) => resolve(r.tempFilePath),
              fail: reject,
            },
            this,
          ),
        );
        if (this.nativeVisible) this.setData({ poster: file, preview: true });
      } catch (e) {
        this.setData({ error: e.message || '海报生成失败，请重试' });
      } finally {
        this.setData({ busy: false });
      }
    },
    save() {
      if (!this.data.poster) return;
      wx.saveImageToPhotosAlbum({
        filePath: this.data.poster,
        success: () => api.message('图片已保存'),
        fail: (e) => {
          this.setData({ albumDenied: /auth|deny|permission/i.test(e.errMsg || '') });
          api.message('未能保存，请检查相册权限后重试');
        },
      });
    },
    permissions() {
      wx.openSetting();
    },
    sendImage() {
      if (wx.showShareImageMenu) wx.showShareImageMenu({ path: this.data.poster });
      else wx.previewImage({ urls: [this.data.poster] });
    },
    onShareAppMessage() {
      return {
        title: this.data.point?.name || '校园发现',
        path: '/pages/detail/index?id=' + this.id,
        imageUrl: this.data.point ? api.asset(this.data.point.photo) : '',
      };
    },
    onShareTimeline() {
      return {
        title: this.data.point?.name || '校园发现',
        query: 'id=' + this.id + '&from=timeline',
      };
    },
  }),
);
