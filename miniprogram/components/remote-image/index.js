const api = require('../../services/api');
Component(
  require('../../services/localization').component({
    properties: {
      administrator: { type: Boolean, value: false },
      source: { type: String, observer: 'load' },
      eager: Boolean,
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
        api.releaseFile(this.retainedFile);
        this.serial = (this.serial || 0) + 1;
        if (this.visibility) this.visibility.disconnect();
      },
    },
    methods: {
      load() {
        api.releaseFile(this.retainedFile);
        this.retainedFile = null;
        this.originalTried = false;
        if (!this.ready) return;
        const source = this.data.source,
          serial = (this.serial = (this.serial || 0) + 1);
        if (this.visibility) this.visibility.disconnect();
        this.setData({ src: '', failed: false });
        if (!source) return;
        // Private files require Authorization; <image> cannot add request headers.
        if (
          !source.startsWith('/shared/') &&
          (this.data.administrator || source.startsWith('/media/') || source.startsWith('/api/'))
        ) {
          this.visibility = this.createIntersectionObserver();
          this.visibility.relativeToViewport({ bottom: 200 }).observe('.frame', (entry) => {
            if (entry.intersectionRatio <= 0 || this.disposed || this.serial !== serial) return;
            this.visibility.disconnect();
            (this.data.administrator ? require('../../services/admin-api') : api)
              .download(source, !this.data.full)
              .then((src) => {
                if (!this.disposed && this.serial === serial) this.display(src);
              })
              .catch(() => {
                if (!this.disposed && this.serial === serial) this.error();
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
        if (!this.data.full && !this.originalTried) {
          this.originalTried = true;
          const client =
            this.data.administrator && !this.data.source.startsWith('/shared/')
              ? require('../../services/admin-api')
              : api;
          const serial = this.serial;
          client
            .download(this.data.source, false)
            .then((src) => {
              if (!this.disposed && serial === this.serial) this.display(src);
            })
            .catch(() => {
              if (!this.disposed && serial === this.serial) this.setData({ failed: true });
            });
          return;
        }
        this.setData({ failed: true });
      },
      display(src) {
        api.retainFile(src);
        api.releaseFile(this.retainedFile);
        this.retainedFile = src;
        this.setData({ src, failed: false });
      },
      retry() {
        if (!this.data.administrator) api.forgetImage(this.data.source, !this.data.full);
        this.load();
      },
    },
  }),
);
