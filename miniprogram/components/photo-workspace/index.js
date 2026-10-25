const api = require('../../services/api'),
  task = require('../../services/photo-task'),
  features = require('../../services/features');
const clock = (value) => {
  const t = new Date(new Date(value).getTime() + 8 * 3600000);
  return (
    String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0')
  );
};
Component(
  require('../../services/localization').component({
    properties: { spot: Object, features: Object, theme: String, styles: String },
    data: {
      active: null,
      stage: 'browse',
      timing: null,
      loading: false,
      error: '',
      saving: false,
      timingVisible: true,
      planChoices: null,
    },
    lifetimes: {
      attached() {
        this.activeView = true;
        this.load();
      },
      detached() {
        this.closePlan();
        this.activeView = false;
        this.serial = (this.serial || 0) + 1;
      },
    },
    pageLifetimes: {
      show() {
        this.activeView = true;
        this.load();
      },
      hide() {
        this.closePlan();
        this.activeView = false;
        this.serial = (this.serial || 0) + 1;
      },
    },
    observers: {
      'spot.id': function () {
        if (this.activeView) this.load();
      },
      features: function () {
        this.setData({ timingVisible: features.visible('photo-timing') });
      },
    },
    methods: {
      async load() {
        const serial = (this.serial = (this.serial || 0) + 1),
          owner = api.identity(),
          saved = task.get();
        let spot = this.data.spot;
        try {
          if (!spot && saved?.spotId)
            spot = await api.request('/api/shooting-spots/' + saved.spotId);
          if (!spot || !this.activeView || serial !== this.serial || owner !== api.identity())
            return;
          this.setData({
            active: spot,
            stage: saved?.spotId === spot.id ? saved.stage : 'browse',
            timingVisible: features.visible('photo-timing'),
            timing: null,
            error: '',
          });
          if (!features.visible('photo-timing') || !features.enabled('photo-timing')) return;
          this.setData({ loading: true });
          const data = await api.request('/api/photography/timing?spotId=' + spot.id);
          if (!this.activeView || serial !== this.serial || owner !== api.identity()) return;
          this.setData({
            timing: {
              ...data,
              windows: data.windows.map((w) => ({
                ...w,
                startLabel: clock(w.start),
                endLabel: clock(w.end),
              })),
            },
          });
        } catch (e) {
          if (this.activeView && serial === this.serial) this.setData({ error: e.message });
        } finally {
          if (this.activeView && serial === this.serial) this.setData({ loading: false });
        }
      },
      noop() {},
      closePlan() {
        this.resolvePlan?.(-1);
        this.resolvePlan = null;
        this.setData({ planChoices: null });
      },
      choosePlan(e) {
        const resolve = this.resolvePlan;
        this.resolvePlan = null;
        this.setData({ planChoices: null });
        resolve?.(Number(e.currentTarget.dataset.index));
      },
      primary() {
        const spot = this.data.active;
        if (!spot || spot.availability === 'closed' || spot.pointOpen === false) return;
        if (this.data.stage === 'arrived') {
          if (features.allow('framing'))
            wx.navigateTo({ url: '/pages/framing/index?id=' + spot.id });
        } else if (this.data.stage === 'captured') this.capture();
        else {
          if (!features.allow('exploration')) return;
          task.set(spot, 'prepare');
          this.setData({ stage: 'prepare' });
          getApp().globalData.photoDestination = { ...spot, name: spot.title, open: true };
          getApp().globalData.mapTab = 'navigation';
          wx.switchTab({ url: '/pages/map/index' });
        }
      },
      arrived() {
        task.set(this.data.active, 'arrived');
        this.setData({ stage: 'arrived' });
      },
      capture() {
        if (!features.allow('publishing')) return;
        const spot = this.data.active;
        task.set(spot, 'captured');
        this.setData({ stage: 'captured' });
        if (api.requireLogin())
          wx.navigateTo({ url: '/pages/checkin/index?id=' + spot.pointId + '&spot=' + spot.id });
      },
      clear() {
        task.clear();
        this.setData({ stage: 'browse' });
        if (!this.data.spot) this.setData({ active: null });
      },
      plans() {
        if (features.allow('plans')) wx.navigateTo({ url: '/pages/plans/index' });
      },
      maintenance() {
        if (features.allow('photo-timing')) this.load();
      },
      async addPlan(e) {
        if (this.data.saving || !features.allow('plans') || !api.requireLogin()) return;
        const window = this.data.timing.windows[Number(e.currentTarget.dataset.index)],
          spot = this.data.active,
          owner = api.identity();
        if (!window) return;
        this.setData({ saving: true });
        try {
          const plans = await api.request('/api/my/plans');
          if (!this.activeView || owner !== api.identity()) return;
          const index = await new Promise((resolve) => {
            this.resolvePlan = resolve;
            this.setData({ planChoices: [{ title: '新建拍摄计划' }, ...plans.items] });
          });
          if (index < 0 || !this.activeView || owner !== api.identity()) return;
          const old = index ? plans.items[index - 1] : null;
          const items = (old?.items || []).map(
            ({ id, spotId, composition, done, minutes = 5 }) => ({
              id,
              spotId,
              composition,
              done,
              minutes,
            }),
          );
          items.push({
            id: require('../../services/model').uuid(),
            spotId: spot.id,
            composition:
              window.label +
              ' · ' +
              window.startLabel +
              '–' +
              window.endLabel +
              '。' +
              window.reason,
            done: false,
            minutes: 30,
          });
          const body = {
            title: old?.title || '今天的校园拍摄',
            departure: old?.departure || window.start,
            checklist: old?.checklist || {},
            items,
          };
          if (old) body.revision = old.revision;
          await api.request(
            '/api/my/plans' + (old ? '/' + old.id : ''),
            old ? 'PUT' : 'POST',
            body,
          );
          if (owner === api.identity()) {
            task.set(spot, 'prepare');
            api.message('已加入拍摄计划，原有出发时间保留');
          }
        } catch (e) {
          api.message(e);
        } finally {
          if (this.activeView) this.setData({ saving: false });
        }
      },
    },
  }),
);
