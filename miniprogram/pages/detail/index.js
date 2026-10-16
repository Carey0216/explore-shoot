const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const model = require('../../services/model');
Page(
  pageOptions({
    data: {
      point: null,
      spots: [],
      spot: null,
      works: [],
      next: null,
      loading: false,
      error: '',
      saved: false,
      dislikeOpen: false,
      reactionBusy: false,
      wallBusy: false,
    },
    onLoad(options) {
      this.id = options.id;
      this.spotId = options.spot || '';
    },
    onShow() {
      this.load();
    },
    onPullDownRefresh() {
      this.load().finally(() => wx.stopPullDownRefresh());
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const [catalog, data] = await Promise.all([
          api.request('/api/catalog'),
          api.request('/api/points/' + encodeURIComponent(this.id) + '/shooting-spots'),
        ]);
        const point = catalog.points.find((p) => p.id === this.id);
        if (!point) throw Error('该地点已下线');
        const spots = data.spots.map((s) => ({
          ...s,
          availabilityText: model.availability[s.availability] || '开放情况待确认',
        }));
        this.setData({
          point,
          spots,
          spot: spots.find((s) => s.id === this.spotId) || spots[0] || null,
          saved: !!(api.session() && (api.session().account.bookmarks || []).includes(this.id)),
        });
        wx.setNavigationBarTitle({ title: point.name });
        this.loadWorks();
        let clientId = wx.getStorageSync('explore-mini-viewer');
        if (!clientId) {
          clientId = model.uuid();
          wx.setStorageSync('explore-mini-viewer', clientId);
        }
        api.request('/api/points/' + this.id + '/view', 'POST', { clientId }).catch(() => {});
      } catch (e) {
        this.setData({ error: e.message, point: null });
      } finally {
        this.setData({ loading: false });
      }
    },
    selectSpot(e) {
      this.spotId = e.currentTarget.dataset.id;
      this.setData({ spot: this.data.spots.find((s) => s.id === this.spotId) });
      this.loadWorks();
    },
    async loadWorks(more = false) {
      if (this.data.wallBusy) return;
      const spotId = (this.spotId = this.data.spot ? this.data.spot.id : '');
      this.setData({ wallBusy: true });
      try {
        const result = await api.request(
          '/api/works?pointId=' +
            encodeURIComponent(this.id) +
            (spotId ? '&spotId=' + encodeURIComponent(spotId) : '') +
            (more && this.data.next ? '&before=' + encodeURIComponent(this.data.next) : ''),
        );
        if (spotId !== this.spotId) return;
        this.setData({
          works: [...(more ? this.data.works : []), ...result.items],
          next: result.next,
        });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ wallBusy: false });
        if (spotId !== this.spotId) this.loadWorks();
      }
    },
    moreWorks() {
      this.loadWorks(true);
    },
    async bookmark() {
      if (!api.requireLogin()) return;
      try {
        const result = await api.request('/api/bookmarks', 'POST', { pointId: this.id });
        const session = api.session();
        session.account.bookmarks = result.bookmarks;
        // Update the account snapshot without replacing the bearer session.
        api.updateAccount(session.account);
        this.setData({ saved: result.bookmarks.includes(this.id) });
      } catch (e) {
        api.message(e);
      }
    },
    like() {
      this.react(this.data.point.myReaction === 'like' ? null : 'like');
    },
    dislike() {
      if (!api.requireLogin()) return;
      if (this.data.point.myReaction === 'dislike') this.react(null);
      else this.setData({ dislikeOpen: true });
    },
    closeDislike() {
      this.setData({ dislikeOpen: false });
    },
    noop() {},
    confirmDislike() {
      this.closeDislike();
      this.react('dislike');
    },
    async react(value) {
      if (!api.requireLogin() || this.data.reactionBusy) return;
      this.setData({ reactionBusy: true });
      try {
        const result = await api.request('/api/points/' + this.id + '/reaction', 'PUT', { value });
        this.setData({ point: result.point });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ reactionBusy: false });
      }
    },
    checkin() {
      if (!api.requireLogin()) return;
      wx.navigateTo({
        url:
          '/pages/checkin/index?point=' +
          this.id +
          (this.data.spot ? '&spot=' + this.data.spot.id : ''),
      });
    },
    navigate() {
      getApp().globalData.destination = this.id;
      wx.switchTab({ url: '/pages/map/index' });
    },
    async preview(e) {
      try {
        const path = await api.download(e.currentTarget.dataset.photo, false);
        wx.previewImage({ urls: [path], current: path });
      } catch (error) {
        api.message(error);
      }
    },
    report(e) {
      if (!api.requireLogin()) return;
      const id = e.currentTarget.dataset.id;
      wx.showActionSheet({
        itemList: ['不适宜的内容', '侵犯隐私或版权', '与机位无关'],
        success: async (result) => {
          const reasons = [
            '作品包含不适宜的内容，请管理员核查',
            '作品涉嫌侵犯隐私或版权，请管理员核查',
            '作品内容与当前机位无关，请管理员核查',
          ];
          try {
            await api.request('/api/works/' + id + '/reports', 'POST', {
              description: reasons[result.tapIndex],
            });
            wx.showToast({ title: '已提交举报', icon: 'success' });
          } catch (error) {
            api.message(error);
          }
        },
      });
    },
    onShareAppMessage() {
      return {
        title: this.data.point ? this.data.point.name : '校园机位',
        path: '/pages/detail/index?id=' + this.id,
      };
    },
  }),
);
