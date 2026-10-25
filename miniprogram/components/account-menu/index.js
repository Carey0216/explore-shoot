Component(
  require('../../services/localization').component({
    data: { initial: '我' },
    observers: {
      account: function (account) {
        this.setData({
          initial: Array.from(account?.nickname || account?.name || account?.username || '我')[0],
        });
      },
    },
    properties: {
      open: Boolean,
      account: Object,
      avatar: String,
      administrator: Boolean,
      theme: String,
      styles: String,
    },
    methods: {
      close() {
        this.triggerEvent('close');
      },
      action(e) {
        this.close();
        this.triggerEvent(e.currentTarget.dataset.action);
      },
    },
  }),
);
