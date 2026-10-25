const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const { activityView } = require('../../services/activity-view');
Page(
  pageOptions({
    data: {
      items: [],
      visible: [],
      phase: 'all',
      seasonOpen: false,
      season: 'all',
      seasonSelected: null,
      seasonLat: 38.496,
      seasonLng: 106.136,
      seasonNames: [
        { id: 'all', name: '四季' },
        { id: 'spring', name: '春日' },
        { id: 'summer', name: '夏日' },
        { id: 'autumn', name: '秋叶' },
        { id: 'winter', name: '冬日' },
        { id: 'blossom', name: '花期' },
        { id: 'snow', name: '雪景' },
      ],
      query: '',
      phases: [
        { id: 'all', name: '全部' },
        { id: 'active', name: '正在进行' },
        { id: 'upcoming', name: '即将开始' },
        { id: 'ended', name: '已结束' },
      ],
      loading: false,
      error: '',
    },
    onShow() {
      if (!this.loadedAt || Date.now() - this.loadedAt > 30000) this.load();
    },
    onHide() {
      this.serial = (this.serial || 0) + 1;
      this.setData({ loading: false });
    },
    async load() {
      const serial = (this.serial = (this.serial || 0) + 1);
      this.setData({ loading: true, error: '' });
      try {
        const [data, catalog] = await Promise.all([
          api.request('/api/topics'),
          api.request('/api/catalog').catch(() => ({ points: [] })),
        ]);
        if (this.serial !== serial) return;
        this.loadedAt = Date.now();
        this.setData({ items: data.items.map((t) => activityView(t, catalog.points)) });
        this.updateList();
        this.seasonList();
      } catch (e) {
        if (this.serial === serial) this.setData({ error: e.message });
      } finally {
        if (this.serial === serial) this.setData({ loading: false });
      }
    },
    toggleSeason() {
      if (!require('../../services/features').allow('map')) return;
      this.setData({ seasonOpen: !this.data.seasonOpen });
      this.seasonList();
    },
    seasonFilter(e) {
      this.setData({ season: e.currentTarget.dataset.id, seasonSelected: null });
      this.seasonList();
    },
    seasonList() {
      const wanted = this.data.seasonNames.map((x) => x.id);
      const seasonTopics = this.data.items.filter(
        (t) =>
          wanted.includes(t.theme) && (this.data.season === 'all' || t.theme === this.data.season),
      );
      this.seasonPoints = [
        ...new Map(
          seasonTopics.flatMap((t) =>
            (t.points || [])
              .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
              .map((p) => [p.id, p]),
          ),
        ).values(),
      ];
      const markers = this.seasonPoints.map((p, i) => {
        const c = require('../../services/coordinates').toTencent(p);
        return {
          id: i + 1,
          latitude: c.lat,
          longitude: c.lng,
          iconPath: '/assets/pin.png',
          width: 20,
          height: 26,
        };
      });
      this.setData({ seasonTopics, seasonMarkers: markers });
    },
    seasonMarker(e) {
      const p = this.seasonPoints?.[e.detail.markerId - 1];
      if (p) {
        const c = require('../../services/coordinates').toTencent(p);
        this.setData({ seasonSelected: p, seasonLat: c.lat, seasonLng: c.lng });
      }
    },
    seasonPlace() {
      if (this.data.seasonSelected)
        wx.navigateTo({
          url: '/pages/detail/index?id=' + encodeURIComponent(this.data.seasonSelected.id),
        });
    },
    updateList() {
      const q = this.data.query.trim().toLowerCase();
      this.setData({
        visible: this.data.items.filter(
          (t) =>
            (this.data.phase === 'all' || t.phase === this.data.phase) &&
            `${t.title} ${t.description} ${t.themeText}`.toLowerCase().includes(q),
        ),
      });
    },
    search(e) {
      this.setData({ query: e.detail.value });
      this.updateList();
    },
    filter(e) {
      this.setData({ phase: e.currentTarget.dataset.id });
      this.updateList();
    },
    open(e) {
      wx.navigateTo({
        url: '/pages/topic/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
      });
    },
  }),
);
