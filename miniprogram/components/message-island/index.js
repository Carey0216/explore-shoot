Component(
  require('../../services/localization').component({
    properties: {
      administrator: {
        type: Boolean,
        observer() {
          this.watch();
        },
      },
      paused: {
        type: Boolean,
        observer() {
          this.watch();
        },
      },
    },
    data: { message: null },
    lifetimes: {
      attached() {
        this.visible = true;
        this.offTheme = require('../../services/appearance').subscribe((v) => this.setData(v));
        this.watch();
      },
      detached() {
        this.visible = false;
        this.unsubscribe?.();
        this.offTheme?.();
      },
    },
    pageLifetimes: {
      show() {
        this.visible = true;
        this.watch();
      },
      hide() {
        this.visible = false;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.setData({ message: null });
      },
    },
    methods: {
      watch() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        if (!this.visible || this.data.administrator || this.data.paused) {
          this.setData({ message: null });
          return;
        }
        this.unsubscribe = require('../../services/message-alerts').subscribe((message) => {
          if (this.visible)
            this.setData({
              message: message
                ? { ...message, preview: String(message.message || '图片或链接消息').slice(0, 120) }
                : null,
            });
        });
      },
      dismiss() {
        require('../../services/message-alerts').dismiss();
      },
      openMessage() {
        const n = this.data.message;
        if (!n || !/^#conversation\/[a-f0-9-]{36}$/i.test(n.target || '')) return;
        const thread = n.target.slice('#conversation/'.length);
        this.triggerEvent('navigate');
        require('../../services/message-alerts').dismiss();
        const page = getCurrentPages().slice(-1)[0];
        if (page?.route === 'pages/contact/index' && page.thread === thread) void page.load();
        else wx.navigateTo({ url: '/pages/contact/index?thread=' + encodeURIComponent(thread) });
      },
    },
  }),
);
