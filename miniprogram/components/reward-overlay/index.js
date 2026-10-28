Component(
  require('../../services/localization').component({
    properties: {
      items: {
        type: Array,
        value: [],
        observer() {
          this.setData({ index: 0, cinemaLanded: false, cinemaReady: false });
        },
      },
    },
    data: { index: 0 },
    lifetimes: {
      attached() {
        this.offTheme = require('../../services/appearance').subscribe((v) => this.setData(v));
      },
      detached() {
        this.offTheme?.();
        clearTimeout(this.impactTimer);
      },
    },
    methods: {
      phase(e) {
        this.setData({
          cinemaLanded: !!e.detail.landed,
          cinemaReady: !!e.detail.ready,
          resultTop: e.detail.resultTop,
        });
      },
      impact() {
        this.setData({ impact: true });
        this.triggerEvent('impact');
        clearTimeout(this.impactTimer);
        this.impactTimer = setTimeout(() => this.setData({ impact: false }), 1150);
      },
      noop() {},
      replay() {
        clearTimeout(this.impactTimer);
        this.setData({ impact: false, cinemaLanded: false, cinemaReady: false });
        this.triggerEvent('impact', { reset: true });
        this.selectComponent('#reward-atlas812')?.replayCinema();
      },
      next() {
        if (this.data.index + 1 < this.data.items.length)
          this.setData({ index: this.data.index + 1 });
        else this.triggerEvent('dismiss');
      },
      close() {
        this.triggerEvent('dismiss');
      },
    },
  }),
);
