Component(
  require('../../services/localization').component({
    properties: { loading: Boolean, error: String, empty: Boolean },
    methods: {
      retry() {
        this.triggerEvent('retry');
      },
    },
  }),
);
