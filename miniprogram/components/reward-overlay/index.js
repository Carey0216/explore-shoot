Component(
  require('../../services/localization').component({
    properties: {
      items: {
        type: Array,
        value: [],
        observer() {
          this.setData({ index: 0 });
        },
      },
    },
    data: { index: 0 },
    methods: {
      noop() {},
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
