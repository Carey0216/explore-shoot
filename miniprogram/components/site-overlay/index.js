Component(
  require('../../services/localization').component({
    properties: { content: Object, runtime: Object, announcement: Object, page: String },
    data: { help: false },
    methods: {
      openHelp() {
        this.setData({ help: true });
        this.triggerEvent('overlay', { open: true });
      },
      dismiss() {
        this.setData({ help: false });
        this.triggerEvent('dismiss');
        this.triggerEvent('overlay', { open: false });
      },
      helpLink(e) {
        this.dismiss();
        require('../../services/links').open(e.currentTarget.dataset.href);
      },
      noop() {},
    },
  }),
);
