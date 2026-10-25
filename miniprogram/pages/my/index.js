const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: {
      account: null,
      moreTools: false,
      passportPreview: null,
      emptyCopy: require('../../services/content73').emptyContent73.saved,
      shortcuts: [
        ['guides', '拍摄指南', 'book', 'exploration'],
        ['passport', '校园护照', 'check', 'passport'],
        ['plans', '拍摄清单', 'camera', 'plans'],
        ['collections', '收藏分组', 'heart', 'plans'],
        ['notes', '探索手记', 'book'],
        ['works', '公开作品', 'discover', 'work-wall'],
        ['contact', '联系管理员', 'bell', 'messages'],
        ['settings', '账户设置', 'settings'],
        ['memories', '校园回忆册', 'book', 'memories'],
        ['updates', '更新日志', 'clock'],
        ['assistant', '校园助手', 'message', 'support'],
      ].map(([id, label, icon, feature], i) => ({
        id,
        label,
        icon,
        feature,
        tone: i % 3,
        darkSuffix: ['-dark', '-dark-green', '-dark-purple'][i % 3],
      })),
      contentTotal: 0,
      contentTab: 'saved',
      contentRows: [],
      contentColumns: [[], []],
      contentPage: 0,
      contentMore: false,
      contentQuery: '',
      contentLoading: false,
      records: [],
      recordColumns: [[], []],
      works: [],
      summary: {},
      unread: 0,
      loading: false,
      error: '',
    },
    featuresChanged() {
      const f = require('../../services/features'),
        key = { saved: 'bookmarks', posts: 'publishing', reports: 'feedback', works: 'work-wall' }[
          this.data.contentTab
        ];
      if (key && !f.visible(key)) {
        this.contentSerial = (this.contentSerial || 0) + 1;
        this.setData({
          contentTab: 'records',
          contentRows: [],
          contentColumns: [[], []],
          contentPage: 0,
          contentLoading: false,
        });
        if (this.nativeVisible && api.session()) void this.loadContent();
      }
    },
    shortcut(e) {
      const item = this.data.shortcuts.find((x) => x.id === e.currentTarget.dataset.id);
      if (!item || (item.feature && !require('../../services/features').allow(item.feature)))
        return;
      if (item.id === 'works')
        return this.contentTab({ currentTarget: { dataset: { id: 'works' } } });
      this[item.id]?.();
    },
    tour() {
      this.selectComponent('#experience')?.replay();
    },
    toggleTools() {
      this.setData({ moreTools: !this.data.moreTools });
    },
    emptyAction() {
      require('../../services/links').open(this.data.emptyCopy[3]);
    },
    scout() {
      wx.navigateTo({ url: '/pages/scout/index' });
    },
    intro() {
      this.selectComponent('#site-overlay')?.openHelp();
    },
    guides() {
      wx.navigateTo({ url: '/pages/guides/index' });
    },
    notes() {
      wx.navigateTo({ url: '/pages/notes/index' });
    },
    updates() {
      wx.navigateTo({ url: '/pages/updates/index' });
    },
    memories() {
      wx.navigateTo({ url: '/pages/memories/index' });
    },
    assistant() {
      this.selectComponent('#experience')?.toggle();
    },
    contentTab(e) {
      const key = {
        saved: 'bookmarks',
        posts: 'publishing',
        reports: 'feedback',
        works: 'work-wall',
      }[e.currentTarget.dataset.id];
      if (!require('../../services/features').allow(key)) return;
      this.setData({
        contentTab: e.currentTarget.dataset.id,
        emptyCopy: require('../../services/content73').emptyContent73[
          e.currentTarget.dataset.id
        ] || [
          '从这里留下第一段探索',
          '照片和足迹，只在你主动分享后才会公开。',
          '去发现校园',
          '#discover',
        ],
        contentRows: [],
        contentColumns: [[], []],
        contentPage: 0,
      });
      this.loadContent();
    },
    contentQuery(e) {
      this.setData({ contentQuery: e.detail.value });
    },
    async loadContent(more = false) {
      if (typeof more !== 'boolean') more = false;
      if (!api.session() || (more && this.data.contentLoading)) return;
      const serial = (this.contentSerial = (this.contentSerial || 0) + 1);
      const tab = this.data.contentTab,
        owner = api.session().account.id,
        page = more ? this.data.contentPage + 1 : 1;
      this.setData({ contentLoading: true });
      try {
        let r;
        if (tab === 'records') r = await api.request('/api/my/records?page=' + page);
        else if (tab === 'works') r = await api.request('/api/my/works?page=' + page);
        else
          r = await api.request(
            '/api/my/content?tab=' +
              tab +
              '&page=' +
              page +
              '&query=' +
              encodeURIComponent(this.data.contentQuery),
          );
        if (
          serial !== this.contentSerial ||
          owner !== api.session()?.account.id ||
          tab !== this.data.contentTab ||
          !this.nativeVisible
        )
          return;
        const rows = (r.points || r.items || []).map((p) =>
            tab === 'saved' || tab === 'posts'
              ? require('../../services/model').pointView(p)
              : {
                  ...p,
                  photo: p.mediaId ? '/media/' + p.mediaId : p.photo,
                  statusText:
                    {
                      pending: '待处理',
                      resolved: '已处理',
                      approved: '已公开',
                      rejected: '未通过',
                      withdrawn: '已撤回',
                      hidden: '已隐藏',
                    }[p.status] || p.status,
                  date: require('../../services/model').shortTime(p.createdAt),
                },
          ),
          items = [...(more ? this.data.contentRows : []), ...rows];
        this.setData({
          contentTotal: Number(r.total ?? items.length),
          contentRows: items,
          contentColumns: [
            items.filter((_, i) => i % 2 === 0),
            items.filter((_, i) => i % 2 === 1),
          ],
          contentPage: page,
          contentMore: !!r.hasMore,
        });
      } catch (e) {
        if (serial === this.contentSerial) this.setData({ error: e.message });
      } finally {
        if (serial === this.contentSerial) this.setData({ contentLoading: false });
      }
    },
    contentMore() {
      if (this.data.contentMore) this.loadContent(true);
    },
    contentOpen(e) {
      const id = e.currentTarget.dataset.id;
      if (this.data.contentTab === 'records') {
        const r = this.data.contentRows.find((r) => r.id === id);
        if (r.sessionId) return wx.navigateTo({ url: '/pages/notes/index?id=' + r.sessionId });
        if (r.pointId) return wx.navigateTo({ url: '/pages/detail/index?id=' + r.pointId });
      } else if (['saved', 'posts'].includes(this.data.contentTab))
        wx.navigateTo({ url: '/pages/detail/index?id=' + id });
    },
    collections() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/collections/index' });
    },
    plans() {
      wx.navigateTo({ url: '/pages/plans/index' });
    },
    topics() {
      wx.switchTab({ url: '/pages/topics/index' });
    },
    support() {
      this.selectComponent('#experience')?.toggle();
    },
    dismissRewards() {
      this.setData({ passportRewards: [] });
    },
    contact() {
      wx.navigateTo({ url: '/pages/contact/index' });
    },
    administration() {
      wx.navigateTo({
        url: require('../../services/admin-api').session()
          ? '/pages/admin-console/index'
          : '/pages/admin/index',
      });
    },
    onShow() {
      const pending = getApp().globalData.pendingMyContent;
      getApp().globalData.pendingMyContent = null;
      if (
        pending?.owner === api.session()?.account.id &&
        ['records', 'works'].includes(pending.tab)
      )
        this.contentTab({ currentTarget: { dataset: { id: pending.tab } } });
      const event = getApp().globalData.pendingPassportRewards;
      getApp().globalData.pendingPassportRewards = null;
      this.setData({
        passportRewards:
          event && event.owner === api.session()?.account.id
            ? [
                ...(event.events.achievements || []),
                ...(event.events.buildings || []),
                ...(event.events.places || []),
              ].map((r) => ({
                ...r,
                badge: api.asset('/shared/badges/' + (r.badgePreset || 'badge-01') + '.png', false),
              }))
            : [],
      });
      if (!this.loadedAt) this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
      this.contentSerial = (this.contentSerial || 0) + 1;
      this.setData({ contentLoading: false });
      this.setData({ loading: false });
    },
    onPullDownRefresh() {
      this.load().finally(() => wx.stopPullDownRefresh());
    },
    async load() {
      const serial = (this.serial = (this.serial || 0) + 1);
      api.removeExpiredSession();
      this.setData({
        account: api.session() && api.session().account,
        error: '',
      });
      if (!api.session()) return;
      this.setData({ loading: true });
      try {
        const [me, library, works, passport, recent] = await Promise.all([
          api.request('/api/auth/me'),
          api.request('/api/my/library?compact=1'),
          api.request('/api/my/works'),
          api.request('/api/my/passport').catch(() => null),
          api.request('/api/my/records?page=1'),
        ]);
        if (serial !== this.serial) return;
        this.loadedAt = Date.now();
        void this.loadContent();
        api.updateAccount(me.account);
        const status = {
          pending: '待审核',
          approved: '已公开',
          rejected: '未通过',
          hidden: '已隐藏',
          withdrawn: '已撤回',
        };
        this.setData({
          account: me.account,
          passportPreview: passport
            ? {
                stamps: (passport.achievements || []).slice(0, 3).map((s) => ({
                  ...s,
                  badge: api.asset(
                    '/shared/badges/' + (s.badgePreset || 'badge-01') + '.png',
                    false,
                  ),
                })),
                earned: (passport.achievements || []).filter((s) => s.earned).length,
              }
            : null,
          summary: library.summary,
          records: (recent.items || []).map((r) => ({
            ...r,
            photo: r.mediaId ? '/media/' + r.mediaId : '',
            date: String(r.createdAt || '').slice(0, 10),
          })),
          works: works.items.map((w) => ({ ...w, statusText: status[w.status] || w.status })),
          unread: me.unreadNotifications,
        });
        this.setData({
          recordColumns: [
            this.data.records.filter((_, i) => i % 2 === 0),
            this.data.records.filter((_, i) => i % 2 === 1),
          ],
        });
        const notice = await api.request('/api/notifications/summary').catch(() => ({ badge: 0 }));
        if (serial !== this.serial) return;
        getApp().globalData.unread = Number(notice.badge) || 0;
        const bar = this.getTabBar && this.getTabBar();
        if (bar && bar.setUnread) bar.setUnread(notice.badge);
      } catch (e) {
        if (serial === this.serial) this.setData({ error: e.message });
      } finally {
        if (serial === this.serial) this.setData({ loading: false });
      }
    },
    login() {
      wx.navigateTo({ url: '/pages/login/index' });
    },
    passport() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/passport/index' });
    },
    notifications() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/notifications/index' });
    },
    settings() {
      wx.navigateTo({ url: '/pages/settings/index' });
    },
    async preview(e) {
      try {
        const path = await api.download(e.currentTarget.dataset.photo, false);
        wx.previewImage({ urls: [path] });
      } catch (e) {
        api.message(e);
      }
    },
    withdraw(e) {
      wx.showModal({
        title: '撤回公开作品？',
        content: '撤回后其他人不可再查看；私人打卡记录继续保留。',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            await api.request('/api/checkins/' + e.currentTarget.dataset.id + '/sharing', 'PUT', {
              public: false,
            });
            this.load();
          } catch (err) {
            api.message(err);
          }
        },
      });
    },
    remove(e) {
      wx.showModal({
        title: '删除这条打卡？',
        content: '关联的公开作品也会移除，此操作不可撤销。',
        confirmColor: '#af4d50',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            await api.request('/api/checkins/' + e.currentTarget.dataset.id, 'DELETE');
            this.load();
          } catch (err) {
            api.message(err);
          }
        },
      });
    },
  }),
);
