const api = require('../../services/api');
const seen = new Set();
Component(
  require('../../services/localization').component({
    properties: { account: Object, page: String, paused: Boolean, administrator: Boolean },
    data: { hint: null },
    lifetimes: {
      attached() {
        this.visible = true;
        this.offTheme = require('../../services/appearance').subscribe((v) => this.setData(v));
        this.schedule();
      },
      detached() {
        this.visible = false;
        clearTimeout(this.timer);
        this.offTheme?.();
      },
    },
    pageLifetimes: {
      show() {
        this.visible = true;
        this.schedule();
      },
      hide() {
        this.visible = false;
        clearTimeout(this.timer);
        this.setData({ hint: null });
      },
    },
    observers: {
      'account,page,paused': function () {
        if (this.visible) this.schedule();
      },
    },
    methods: {
      schedule() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.prepare(), 1000);
      },
      async prepare() {
        const owner = api.session()?.account.id,
          page = getCurrentPages().slice(-1)[0],
          route = page?.route || '',
          point = page?.pointId || page?.id || '',
          key = owner + ':' + route + ':' + point;
        if (
          !this.visible ||
          this.data.administrator ||
          this.data.paused ||
          !owner ||
          seen.has(key) ||
          !require('../../services/features').visible('passport') ||
          !require('../../services/features').enabled('passport')
        )
          return;
        if (!['discover', 'shots', 'map', 'my', 'detail', 'plans'].includes(route.split('/')[1]))
          return;
        if (getApp().globalData.messageIslandBusy813 || getApp().globalData.nativeRewardActive813) {
          this.schedule();
          return;
        }
        try {
          const data = await api.request('/api/my/passport');
          if (!this.visible || this.data.paused || api.session()?.account.id !== owner) return;
          if (
            getApp().globalData.messageIslandBusy813 ||
            getApp().globalData.nativeRewardActive813
          ) {
            this.schedule();
            return;
          }
          const buildings = data.atlas.buildings.filter(
              (b) => b.frame === 'photo' && b.pointIds.length,
            ),
            linked = buildings.find((b) => b.pointIds.includes(point)),
            next = linked || buildings.find((b) => !b.collected);
          if (!next) return;
          seen.add(key);
          this.setData({
            hint: {
              building: next.id,
              point: linked ? point : next.pointIds[0],
              title: linked
                ? linked.collected
                  ? '再走一次「' + next.name + '」'
                  : '这一站，能让建筑落进你的校园'
                : '下一栋，去点亮「' + next.name + '」',
              text: linked
                ? linked.collected
                  ? '再次打卡，留下新足迹，重温建筑落位'
                  : '真实打卡后，看建筑从大到小落位'
                : '看看关联地点、完成条件和路线',
              direct: !!linked,
            },
          });
          this.timer = setTimeout(() => this.setData({ hint: null }), 6500);
        } catch {}
      },
      close() {
        clearTimeout(this.timer);
        this.setData({ hint: null });
      },
      refresh() {
        const page = getCurrentPages().slice(-1)[0];
        seen.delete(
          api.session()?.account.id +
            ':' +
            (page?.route || '') +
            ':' +
            (page?.pointId || page?.id || ''),
        );
        this.schedule();
      },
      open() {
        const h = this.data.hint;
        if (!h) return;
        this.close();
        wx.navigateTo({
          url: h.direct
            ? '/pages/checkin/index?point=' + encodeURIComponent(h.point)
            : '/pages/passport/index?building=' + encodeURIComponent(h.building),
        });
      },
    },
  }),
);
