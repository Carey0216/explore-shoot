Component(
  require('../../services/localization').component({
    properties: { loading: Boolean, error: String, empty: Boolean, skeleton: Boolean },
    methods: {
      retry() {
        this.triggerEvent('retry');
      },
    },
  }),
);
