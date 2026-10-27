Component(
  require('../../services/localization').component({
    properties: { value: Object, administrator: Boolean },
    data: { fileStatus: {} },
    lifetimes: {
      attached() {
        this.offTheme = require('../../services/appearance').subscribe((v) => this.setData(v));
      },
      detached() {
        this.offTheme?.();
      },
    },
    methods: {
      async file(e) {
        if (this.fileOpening) return;
        const file = this.data.value?.files?.[Number(e.currentTarget.dataset.index)];
        this.fileOpening = true;
        const index = Number(e.currentTarget.dataset.index);
        this.setData({ ['fileStatus.' + index]: '正在下载…' });
        try {
          await require('../../services/message-file-download').open(
            file,
            this.data.administrator,
            (p) => this.setData({ ['fileStatus.' + index]: '下载 ' + p + '%' }),
          );
          this.setData({ ['fileStatus.' + index]: '点击可再次打开 / 保存' });
        } catch (error) {
          this.setData({
            ['fileStatus.' + index]: /cancel/.test(error.errMsg || '')
              ? '点击继续打开 / 保存'
              : (error.message || '下载失败') + ' · 点此重试',
          });
          if (!/cancel/.test(error.errMsg || '')) require('../../services/api').message(error);
        } finally {
          this.fileOpening = false;
        }
      },
      async preview() {
        if (!this.data.value?.image || this.previewing) return;
        this.previewing = true;
        const api = this.data.administrator
          ? require('../../services/admin-api')
          : require('../../services/api');
        try {
          const src = await api.download(this.data.value.image, false);
          wx.previewImage({ current: src, urls: [src] });
        } catch (e) {
          require('../../services/api').message(e);
        } finally {
          this.previewing = false;
        }
      },
      link(e) {
        this.triggerEvent('navigate');
        require('../../services/links').open(e.currentTarget.dataset.href);
      },
    },
  }),
);
