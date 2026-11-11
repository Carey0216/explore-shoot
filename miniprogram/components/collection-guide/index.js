const api = require('../../services/api');
const seen = new Set();
const nextHintAt = new Map();
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
        if (!this.data.account || this.data.paused) this.setData({ hint: null });
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
            linked = buildings.find((b) => b.points?.some((p) => p.id === point && p.open)),
            recommendation = data.nextBuildings?.[0],
            next = linked || buildings.find((b) => b.id === recommendation?.buildingId);
          if (!next) return;
          if (!linked && Date.now() < (nextHintAt.get(owner) || 0)) return;
          const name = linked
            ? linked.points.find((p) => p.id === point).name
            : recommendation.name;
          const header = page.selectComponent?.('#community-header');
          const bounds = (scope, selector) =>
            scope &&
            new Promise((resolve) =>
              scope.createSelectorQuery().select(selector).boundingClientRect(resolve).exec(),
            );
          const [toolbar, mapTabs] = await Promise.all([
            bounds(header, '.header'),
            route === 'pages/map/index' ? bounds(page, '.map-tabs821') : null,
          ]);
          if (
            !this.visible ||
            this.data.paused ||
            api.session()?.account.id !== owner ||
            getCurrentPages().slice(-1)[0] !== page
          )
            return;
          seen.add(key);
          if (!linked) nextHintAt.set(owner, Date.now() + 30000);
          this.setData({
            hint: {
              building: next.id,
              point: linked ? point : recommendation.pointId,
              top: Math.max(10, Math.max(toolbar?.bottom || 0, mapTabs?.bottom || 0) + 8),
              title: linked
                ? linked.collected
                  ? '再走一次「' + name + '」'
                  : '这一站，能让建筑落进你的校园'
                : '下一栋 · ' + name,
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
