Component(
  require('../../services/localization').component({
    properties: { loading: Boolean, error: String, empty: Boolean, skeleton: Boolean },
    data: { reducedMotion: false },
    lifetimes: {
      attached() {
        this.offMotion = require('../../services/appearance').subscribe((data) =>
          this.setData({ reducedMotion: !!data.reducedMotion }),
        );
      },
      detached() {
        this.offMotion?.();
      },
    },
    methods: {
      retry() {
        this.triggerEvent('retry');
      },
    },
  }),
);
