Component(
  require('../../services/localization').component({
    properties: { value: Object, administrator: Boolean },
    methods: {
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
