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
    data: {
      src: '',
      failed: false,
      loading: false,
      imageSerial: 0,
      failureReason: '图片加载中断，可重试',
    },
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
              .catch((error) => {
                if (!this.disposed && this.serial === serial) this.error(error);
              });
          });
        } else {
          try {
            const src = api.asset(source, !this.data.full);
            if (!src) {
              this.setData({
                failed: true,
                loading: false,
                failureReason: '图片地址不可用，可反馈此图片',
              });
              return;
            }
            this.setData({ src });
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
        const type =
          e?.status === 404 || e?.status === 410
            ? 'image-address'
            : e?.network
              ? 'image-failed'
              : 'image-decode';
        this.setData({
          failureReason:
            type === 'image-address'
              ? '图片地址已失效，可重试或反馈'
              : type === 'image-decode'
                ? '图片格式暂未解码成功，可重试'
                : '网络未能载入图片，可重试',
        });
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
            .catch((error) => {
              if (!this.disposed && serial === this.serial) {
                this.setData({ failed: true, loading: false });
                require('../../services/client-health').report(
                  error.status === 404 || error.status === 410 ? 'image-address' : 'image-failed',
                  this.data.source,
                  error.status || 0,
                );
              }
            });
          return;
        }
        this.setData({ failed: true, loading: false });
        require('../../services/client-health').report(type, this.data.source, e?.status || 0);
      },
      display(src) {
        api.retainFile(src);
        api.releaseFile(this.retainedFile);
        this.retainedFile = src;
        this.setData({ src, failed: false, loading: true, imageSerial: this.serial });
      },
      retry() {
        if (!this.data.administrator) {
          api.forgetImage(this.data.source, true);
          api.forgetImage(this.data.source, false);
        }
        this.load();
      },
    },
  }),
);
