const api = require('../../services/api'),
  { pageOptions } = require('../../services/page'),
  { qrcodegen } = require('../../services/qrcodegen'),
  { miniCode } = require('../../services/share-codes'),
  { paintShareQR, pointCodeAreas, posterStyles } = require('../../services/passport-card-art');
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
    data: {
      point: null,
      poster: '',
      codes: [],
      posterStyle: -1,
      preview: false,
      busy: false,
      error: '',
      albumDenied: false,
    },
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
    changeStyle() {
      void this.generate((this.data.posterStyle + 1) % posterStyles.length);
    },
    async generate(styleOverride) {
      if (this.data.busy || !this.data.point) return;
      const switching = Number.isInteger(styleOverride);
      if (this.data.poster && !switching) return this.setData({ preview: true });
      const style = switching ? styleOverride : this.data.themeDark ? 2 : 0;
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
        const wechatCode = miniCode(node, this.id);
        node.width = 900;
        node.height = 1200;
        const ctx = node.getContext('2d');
        const dark = style === 2;
        const [, paper, ink, muted] = posterStyles[style];
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, 900, 1200);
        ctx.fillStyle = ink;
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
        ctx.fillStyle = ink;
        ctx.font = 'bold 42px sans-serif';
        text(ctx, this.data.point.name, 48, 700, 804, 54, 2);
        ctx.fillStyle = muted;
        ctx.font = '25px sans-serif';
        text(ctx, this.data.point.description, 48, 825, 804, 39, 3);
        const qr = qrcodegen.QrCode.encodeText(this.url(), qrcodegen.QrCode.Ecc.MEDIUM);
        paintShareQR(ctx, qr, 48, 950, 200);
        const code = await wechatCode;
        if (owner !== api.session()?.account.id) throw Error('账号已改变，请重新生成');
        if (code) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(270, 950, 200, 200);
          ctx.drawImage(code, 278, 958, 184, 184);
        }
        const x = code ? 512 : 286;
        ctx.fillStyle = ink;
        ctx.font = '24px sans-serif';
        ctx.fillText('网页二维码', 48, 1180);
        if (code) ctx.fillText('微信小程序码', 270, 1180);
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText('景遇 · 校园发现', x, 995);
        ctx.font = '22px sans-serif';
        ctx.fillStyle = muted;
        text(ctx, '看机位、找路线，留下一次校园发现。', x, 1038, 852 - x, 33, 2);
        text(ctx, '地点公开资料', x, 1115, 852 - x);
        if (!code) ctx.fillText('微信小程序码暂不可用', x, 1160);
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
        if (this.nativeVisible && (!switching || this.data.preview))
          this.setData({
            poster: file,
            codes: pointCodeAreas(Boolean(code)),
            posterStyle: style,
            preview: true,
          });
      } catch (e) {
        this.setData({ error: e.message || '海报生成失败，请重试' });
        if (switching) api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    async editedFile() {
      if (this.data.busy || !this.data.poster) return null;
      const editor = this.selectComponent('#art-editor');
      const owner = api.identity();
      try {
        const file = await editor?.file();
        if (this.data.preview && owner === api.identity()) return file;
      } catch (error) {
        api.message(error);
      }
      return null;
    },
    async save() {
      const file = await this.editedFile();
      if (!file) return;
      wx.saveImageToPhotosAlbum({
        filePath: file,
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
    async sendImage() {
      const file = await this.editedFile();
      if (!file) return;
      if (wx.showShareImageMenu) wx.showShareImageMenu({ path: file });
      else wx.previewImage({ urls: [file] });
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
