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
        getApp().globalData.messageIslandBusy813 = false;
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
        getApp().globalData.messageIslandBusy813 = false;
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
          getApp().globalData.messageIslandBusy813 = false;
          this.setData({ message: null });
          return;
        }
        this.unsubscribe = require('../../services/message-alerts').subscribe((message) => {
          getApp().globalData.messageIslandBusy813 = !!message;
          if (message) this.triggerEvent('busy');
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
