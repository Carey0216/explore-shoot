const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      items: [],
      season: 'all',
      time: 'all',
      seasons: [
        { id: 'all', name: '全部季节' },
        { id: 'spring', name: '春' },
        { id: 'summer', name: '夏' },
        { id: 'autumn', name: '秋' },
        { id: 'winter', name: '冬' },
        { id: 'unknown', name: '时间未填写' },
      ],
      bands: [
        { id: 'all', name: '全部时段' },
        { id: 'morning', name: '清晨' },
        { id: 'day', name: '白天' },
        { id: 'evening', name: '傍晚' },
        { id: 'night', name: '夜间' },
        { id: 'unknown', name: '时间未填写' },
      ],
      page: 1,
      hasMore: false,
      loading: false,
      error: '',
    },
    onLoad(o) {
      this.spot = o.id;
    },
    onShow() {
      this.load();
    },
    async load(more = false) {
      if (typeof more !== 'boolean') more = false;
      const token = (this.serial = (this.serial || 0) + 1);
      this.setData({ loading: true, error: '' });
      try {
        const p = more ? this.data.page + 1 : 1,
          r = await api.request(
            '/api/works/compare?spotId=' +
              encodeURIComponent(this.spot) +
              '&season=' +
              this.data.season +
              '&time=' +
              this.data.time +
              '&page=' +
              p,
          );
        if (token === this.serial && this.nativeVisible)
          this.setData({
            items: [...(more ? this.data.items : []), ...r.items],
            page: p,
            hasMore: r.hasMore,
          });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        if (token === this.serial) this.setData({ loading: false });
      }
    },
    filter(e) {
      this.setData({ [e.currentTarget.dataset.kind]: e.currentTarget.dataset.id });
      this.load();
    },
    more() {
      if (!this.data.loading && this.data.hasMore) this.load(true);
    },
    async preview(e) {
      try {
        const path = await api.download(e.currentTarget.dataset.path, false);
        wx.previewImage({ urls: [path] });
      } catch (e) {
        api.message(e);
      }
    },
  }),
);
