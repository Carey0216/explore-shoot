const { drawShareArtwork, shareInk } = require('../../services/passport-card-art');

Component({
  properties: {
    source: String,
    codes: Array,
    locale: String,
    dark: Boolean,
    long: Boolean,
  },
  data: {
    inks: shareInk,
    ink: 2,
    tool: '',
    count: 0,
    width: 220,
    height: 293,
    stageHeight: 293,
    guideVisible: false,
    guidePlaying: false,
    tools: [
      { id: 'pen', zh: '画笔', en: 'Pen' },
      { id: 'sparkle', zh: '✦ 星光', en: '✦ Sparkle' },
      { id: 'heart', zh: '♡ 爱心', en: '♡ Heart' },
      { id: 'mountain', zh: '△ 山峰', en: '△ Mountain' },
    ],
  },
  observers: {
    source(path) {
      if (path && this.canvas) this.loadImage(path);
    },
  },
  lifetimes: {
    attached() {
      this.marks = [];
    },
    ready() {
      this.createSelectorQuery()
        .select('#share-art')
        .fields({ node: true })
        .exec((result) => {
          this.canvas = result[0]?.node;
          if (this.canvas && this.data.source) this.loadImage(this.data.source);
        });
    },
    detached() {
      if (this.canvas) this.canvas.width = this.canvas.height = 1;
      this.canvas = this.image = null;
    },
  },
  methods: {
    loadImage(path) {
      const canvas = this.canvas;
      const image = canvas.createImage();
      this.image = null;
      image.onload = () => {
        if (canvas !== this.canvas || this.data.source !== path) return;
        const window = wx.getWindowInfo?.() || wx.getSystemInfoSync();
        const scale = Math.min(
          330 / image.width,
          (window.windowWidth - 48) / image.width,
          this.data.long ? 1 : (window.windowHeight * 0.47) / image.height,
        );
        canvas.width = image.width;
        canvas.height = image.height;
        this.image = image;
        const height = Math.floor(image.height * scale);
        this.setData({
          width: Math.floor(image.width * scale),
          height,
          stageHeight: Math.min(height, Math.floor(window.windowHeight * 0.47)),
        });
        this.draw();
      };
      image.onerror = () => {
        if (canvas === this.canvas && this.data.source === path)
          wx.showToast({ title: '图片暂不可编辑', icon: 'none' });
      };
      image.src = path;
    },
    chooseTool(e) {
      const tool = e.currentTarget.dataset.id;
      this.stroke = null;
      this.setData({ tool: tool === this.data.tool ? '' : tool });
    },
    chooseInk(e) {
      this.setData({ ink: Number(e.currentTarget.dataset.index) });
    },
    toggleGuide() {
      const guideVisible = !this.data.guideVisible;
      this.setData({ guideVisible, guidePlaying: guideVisible });
    },
    replayGuide() {
      this.setData({ guidePlaying: false }, () => this.setData({ guidePlaying: true }));
    },
    point(e) {
      const touch = e.touches[0];
      if (!touch) return null;
      const pair = [touch.x / this.data.width, touch.y / this.data.height];
      return pair.every((v) => v >= 0 && v <= 1) ? pair : null;
    },
    start(e) {
      const point = this.point(e);
      const { tool, ink } = this.data;
      if (!tool || !point || !this.image || this.marks.length >= 80 || e.touches.length !== 1)
        return;
      const mark = { kind: tool, color: shareInk[ink], points: [point] };
      this.marks.push(mark);
      this.stroke = tool === 'pen' ? mark : null;
      this.setData({ count: this.marks.length });
      this.draw();
    },
    move(e) {
      if (!this.stroke || this.stroke.points.length >= 320 || e.touches.length !== 1) return;
      const point = this.point(e);
      if (!point) return;
      this.stroke.points.push(point);
      this.draw();
    },
    end() {
      this.stroke = null;
    },
    undo() {
      this.marks.pop();
      this.setData({ count: this.marks.length });
      this.draw();
    },
    draw() {
      if (!this.canvas || !this.image) return;
      const { width, height } = this.canvas;
      drawShareArtwork(
        this.canvas.getContext('2d'),
        this.image,
        width,
        height,
        this.marks,
        this.data.codes,
      );
    },
    file() {
      if (!this.marks.length) return Promise.resolve(this.data.source);
      if (!this.image) return Promise.reject(Error('请等待图片加载'));
      return new Promise((resolve, reject) =>
        wx.canvasToTempFilePath(
          {
            canvas: this.canvas,
            fileType: 'png',
            success: (result) => resolve(result.tempFilePath),
            fail: reject,
          },
          this,
        ),
      );
    },
  },
});
