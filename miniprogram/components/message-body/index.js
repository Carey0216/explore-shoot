Component(
  require('../../services/localization').component({
    properties: { value: Object, administrator: Boolean },
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
        try {
          await require('../../services/message-file-download').open(file, this.data.administrator);
        } catch (error) {
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
