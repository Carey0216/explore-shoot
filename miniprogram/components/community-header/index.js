const api = require('../../services/api');
Component(
  require('../../services/localization').component({
    properties: { active: String },
    options: { styleIsolation: 'apply-shared' },
    data: {
      menuOpen: false,
      avatar: '',
      account: null,
      initial: '我',
      unread: 0,
      messagesVisible: true,
    },
    lifetimes: {
      attached() {
        this.offTheme = require('../../services/appearance').subscribe((data) =>
          this.setData({
            themeDark: data.themeDark,
            themeClass: data.themeClass,
            themeStyle: data.themeStyle,
          }),
        );
      },
      detached() {
        this.offTheme?.();
      },
    },
    pageLifetimes: {
      hide() {
        this.setData({ menuOpen: false });
      },
      show() {
        const owner = api.session()?.account.id;
        this.headerOwner = owner;
        const account = api.session()?.account;
        void api
          .cached('/api/features')
          .then((r) =>
            this.setData({
              messagesVisible: r.features.notifications?.visible !== false,
            }),
          )
          .catch(() => {});
        this.setData({ unread: 0 });
        this.setData({
          account,
          menuOpen: false,
          initial: (account?.nickname || '我').slice(0, 1),
          avatar: account?.avatarPreset ? '/assets/avatars/' + account.avatarPreset + '.png' : '',
        });
        if (account?.hasAvatar)
          api
            .download('/api/auth/avatar?v=' + account.avatarVersion, false)
            .then((src) => {
              if (owner === this.headerOwner) this.setData({ avatar: src });
            })
            .catch(() => {});
        if (account)
          api
            .request('/api/notifications/summary')
            .then((r) => {
              if (owner === this.headerOwner) this.setData({ unread: r.badge ?? r.unread });
            })
            .catch(() => {});
      },
    },
    methods: {
      search() {
        getApp().globalData.focusSpotSearch = true;
        wx.switchTab({ url: '/pages/shots/index' });
      },
      discover() {
        wx.switchTab({ url: '/pages/discover/index' });
      },
      shots() {
        wx.switchTab({ url: '/pages/shots/index' });
      },
      messages() {
        if (!require('../../services/features').allow('notifications')) return;
        if (api.requireLogin()) wx.navigateTo({ url: '/pages/notifications/index' });
      },
      toggleMenu() {
        this.setData({ menuOpen: !this.data.menuOpen });
      },
      async logout() {
        const owner = api.session()?.account?.id;
        try {
          await api.request('/api/auth/logout', 'POST', {});
          if (owner !== api.session()?.account?.id) return;
          api.clearSession();
          this.setData({ account: null, avatar: '', initial: '我' });
          wx.switchTab({ url: '/pages/my/index' });
        } catch (e) {
          api.message(e);
        }
      },
      closeMenu() {
        this.setData({ menuOpen: false });
      },
      records() {
        this.closeMenu();
        if (!api.requireLogin()) return;
        const current = getCurrentPages().slice(-1)[0];
        if (current?.route === 'pages/my/index')
          current.contentTab({ currentTarget: { dataset: { id: 'records' } } });
        else {
          getApp().globalData.pendingMyContent = {
            owner: api.session().account.id,
            tab: 'records',
          };
          wx.switchTab({ url: '/pages/my/index' });
        }
      },
      administration() {
        this.closeMenu();
        wx.navigateTo({
          url: require('../../services/admin-api').session()
            ? '/pages/admin-console/index'
            : '/pages/admin/index',
        });
      },
      settings() {
        this.closeMenu();
        wx.navigateTo({ url: '/pages/settings/index' });
      },
      login() {
        this.closeMenu();
        wx.navigateTo({ url: '/pages/login/index' });
      },
      editAvatar() {
        wx.navigateTo({ url: '/pages/avatar/index' });
      },
      my() {
        this.closeMenu();
        wx.switchTab({ url: '/pages/my/index' });
      },
    },
  }),
);
