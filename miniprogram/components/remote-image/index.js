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
    data: { src: '', failed: false, loading: false, imageSerial: 0 },
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
        this.setData({ src: '', failed: false, loading: !!source, imageSerial: serial });
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
            this.setData({ failed: true, loading: false });
          }
        }
      },
      loaded(e) {
        if (
          e?.currentTarget?.dataset?.serial != null &&
          Number(e.currentTarget.dataset.serial) !== this.serial
        )
          return;
        this.setData({ loading: false });
      },
      error(e) {
        if (
          e?.currentTarget?.dataset?.serial != null &&
          Number(e.currentTarget.dataset.serial) !== this.serial
        )
          return;
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
              if (!this.disposed && serial === this.serial)
                this.setData({ failed: true, loading: false });
            });
          return;
        }
        this.setData({ failed: true, loading: false });
        require('../../services/client-health').report('image-failed');
      },
      display(src) {
        api.retainFile(src);
        api.releaseFile(this.retainedFile);
        this.retainedFile = src;
        this.setData({ src, failed: false, loading: true, imageSerial: this.serial });
      },
      retry() {
        if (!this.data.administrator) api.forgetImage(this.data.source, !this.data.full);
        this.load();
      },
    },
  }),
);
