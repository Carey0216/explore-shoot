const api = require('../../services/api');
Component({
  properties: {
    administrator: { type: Boolean, value: false },
    source: { type: String, observer: 'load' },
    full: { type: Boolean, value: false },
    mode: { type: String, value: 'widthFix' },
  },
  data: { src: '', failed: false },
  lifetimes: {
    attached() {
      this.ready = true;
      this.load();
    },
    detached() {
      this.disposed = true;
      this.serial = (this.serial || 0) + 1;
      if (this.visibility) this.visibility.disconnect();
    },
  },
  methods: {
    load() {
      if (!this.ready) return;
      const source = this.data.source,
        serial = (this.serial = (this.serial || 0) + 1);
      if (this.visibility) this.visibility.disconnect();
      this.setData({ src: '', failed: false });
      if (!source) return;
      // Private files require Authorization; <image> cannot add request headers.
      if (source.startsWith('/media/') || source.startsWith('/api/messages/media/')) {
        this.visibility = this.createIntersectionObserver();
        this.visibility.relativeToViewport({ bottom: 200 }).observe('.frame', (entry) => {
          if (entry.intersectionRatio <= 0 || this.disposed || this.serial !== serial) return;
          this.visibility.disconnect();
          (this.data.administrator ? require('../../services/admin-api') : api)
            .download(source, !this.data.full)
            .then((src) => {
              if (!this.disposed && this.serial === serial) this.setData({ src });
            })
            .catch(() => {
              if (!this.disposed && this.serial === serial) this.setData({ failed: true });
            });
        });
      } else {
        try {
          this.setData({ src: api.asset(source, !this.data.full) });
        } catch (_) {
          this.setData({ failed: true });
        }
      }
    },
    error() {
      this.setData({ failed: true });
    },
  },
});
