const api = require('../../services/api');
const scope = () =>
  require('../../services/network').configuredOrigin() +
  ':' +
  (api.session()?.account.id || 'guest');
Page(
  require('../../services/page').pageOptions({
    data: {
      places: [],
      items: [],
      loading: false,
      error: '',
      placeIndex: 0,
      left: 1,
      right: 0,
      split: 50,
      first: null,
      second: null,
    },
    onReady() {
      this.measure();
    },
    onResize() {
      this.measure();
    },
    measure() {
      wx.nextTick(() =>
        wx
          .createSelectorQuery()
          .in(this)
          .select('.compare')
          .boundingClientRect((r) => {
            if (r) this.setData({ compareWidth: r.width });
          })
          .exec(),
      );
    },
    onShow() {
      const owner = scope();
      if (owner !== this.timelineOwner) {
        this.timelineOwner = owner;
        this.point = '';
        this.page = 1;
        this.loaded = false;
        this.loadRun = (this.loadRun || 0) + 1;
        this.pairRun = (this.pairRun || 0) + 1;
        this.setData({
          placeIndex: 0,
          left: 1,
          right: 0,
          places: [],
          items: [],
          first: null,
          second: null,
          firstPhoto: '',
          secondPhoto: '',
          loading: false,
          error: '',
          photoError: '',
        });
      }
      if (api.requireLogin() && !this.loaded) void this.load();
    },
    async load(append = false) {
      if (typeof append !== 'boolean') append = false;
      if (append && this.data.loading) return;
      const owner = scope(),
        run = (this.loadRun = (this.loadRun || 0) + 1),
        requestedPoint = this.point || '',
        requestedPage = append ? (this.page || 1) + 1 : 1;
      this.retryAppend = append;
      this.setData({ loading: true, error: '' });
      try {
        const d = await api.request(
          '/api/my/passport/timeline?point=' +
            encodeURIComponent(requestedPoint) +
            '&page=' +
            requestedPage,
        );
        if (!this.nativeVisible || run !== this.loadRun || owner !== scope()) return;
        this.page = requestedPage;
        this.setData({
          places: d.places,
          items: append ? [...this.data.items, ...d.items] : d.items,
          hasMore: d.hasMore,
        });
        if (!this.point && d.places.length) {
          this.point = d.places[0].id;
          this.setData({ loading: false });
          return this.load();
        }
        this.loaded = true;
        this.setData({
          items: this.data.items.map((r) => ({
            ...r,
            label: new Date(r.date).toLocaleString(),
            seasonLabel: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[r.season] || '',
            timeLabel: r.time === 'day' ? '白天' : '傍晚',
          })),
        });
        void this.pair();
      } catch (e) {
        if (this.nativeVisible && run === this.loadRun && owner === scope())
          this.setData({ error: e.message });
      } finally {
        if (run === this.loadRun && owner === scope()) this.setData({ loading: false });
      }
    },
    place(e) {
      this.point = this.data.places[Number(e.detail.value)]?.id;
      this.page = 1;
      this.pairRun = (this.pairRun || 0) + 1;
      this.setData({
        placeIndex: Number(e.detail.value),
        left: 1,
        right: 0,
        items: [],
        first: null,
        second: null,
        firstPhoto: '',
        secondPhoto: '',
        photoError: '',
      });
      void this.load();
    },
    pick(e) {
      this.setData({ [e.currentTarget.dataset.side]: Number(e.detail.value) });
      void this.pair();
    },
    split(e) {
      this.setData({ split: Number(e.detail.value) });
    },
    async pair() {
      const run = (this.pairRun = (this.pairRun || 0) + 1),
        owner = scope();
      const a = this.data.items[this.data.left] || this.data.items[0],
        b = this.data.items[this.data.right] || a;
      this.setData({
        first: a || null,
        second: b || null,
        firstPhoto: '',
        secondPhoto: '',
        photoError: '',
      });
      this.measure();
      if (!a) return;
      try {
        const [firstPhoto, secondPhoto] = await Promise.all([
          api.download(a.photo, false),
          api.download(b.photo, false),
        ]);
        if (this.nativeVisible && run === this.pairRun && owner === scope())
          this.setData({ firstPhoto, secondPhoto });
      } catch (e) {
        if (this.nativeVisible && run === this.pairRun && owner === scope())
          this.setData({ photoError: e.message });
      }
    },
    more() {
      void this.load(true);
    },
    retryLoad() {
      return this.load(this.retryAppend === true);
    },
    retake() {
      const r = this.data.first;
      if (r?.canRetake)
        wx.navigateTo({
          url:
            '/pages/framing/index?record=' +
            encodeURIComponent(r.id) +
            '&point=' +
            encodeURIComponent(r.pointId),
        });
    },
    onUnload() {
      this.loadRun = (this.loadRun || 0) + 1;
      this.pairRun = (this.pairRun || 0) + 1;
    },
  }),
);
