const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { toTencent } = require('../../services/coordinates');
const model = require('../../services/model');
Page(
  pageOptions({
    data: {
      tab: 'map',
      latitude: 38.496,
      longitude: 106.107,
      markers: [],
      points: [],
      selected: null,
      error: '',
      loading: false,
      current: false,
    },
    onLoad() {
      this.load();
    },
    onShow() {
      const tab = getApp().globalData.mapTab;
      if (tab) {
        this.setData({ tab });
        getApp().globalData.mapTab = null;
      }
      const id = getApp().globalData.destination;
      if (id && this.data.points.length) this.select(id);
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const result = await api.request('/api/catalog');
        this.points = result.points;
        const markers = result.points.map((p, i) => {
          const c = toTencent(p);
          return {
            id: i + 1,
            longitude: c.lng,
            latitude: c.lat,
            iconPath: '/assets/pin.png',
            width: 26,
            height: 34,
            callout: {
              content: p.name,
              display: 'BYCLICK',
              padding: 8,
              borderRadius: 8,
              color: '#245b4c',
            },
          };
        });
        this.setData({ points: result.points, markers });
        const id = getApp().globalData.destination;
        this.select(id || (result.points[0] && result.points[0].id));
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    select(id) {
      const selected = this.data.points.find((p) => p.id === id);
      if (!selected) return;
      const c = toTencent(selected);
      this.setData({ selected, longitude: c.lng, latitude: c.lat });
      getApp().globalData.destination = null;
    },
    marker(e) {
      const p = this.points[e.detail.markerId - 1];
      if (p) this.select(p.id);
    },
    picker(e) {
      const p = this.points[Number(e.detail.value)];
      if (p) this.select(p.id);
    },
    tab(e) {
      this.setData({ tab: e.currentTarget.dataset.id });
    },
    planRoute() {
      if (this.data.selected) this.setData({ tab: 'navigation' });
    },
    async locate() {
      try {
        const p = await model.location('gcj02');
        this.setData({ longitude: p.lng, latitude: p.lat, current: true });
      } catch (e) {
        api.message(e);
      }
    },
    navigate() {
      if (!this.data.selected) return;
      const p = this.data.selected,
        c = toTencent(p);
      wx.openLocation({
        latitude: c.lat,
        longitude: c.lng,
        name: p.name,
        address: p.address || '',
        scale: 18,
        fail() {
          api.message(Error('地图打开失败，请稍后重试'));
        },
      });
    },
    detail() {
      if (this.data.selected)
        wx.navigateTo({ url: '/pages/detail/index?id=' + this.data.selected.id });
    },
    passport() {
      if (api.requireLogin()) wx.navigateTo({ url: '/pages/passport/index' });
    },
  }),
);
