const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
const model = require('../../services/model');
Page(
  pageOptions({
    data: { items: [], loading: false, error: '', busy: false, shareToken: '', shareTitle: '' },
    onLoad(options) {
      this.addSpot = options.spot || '';
      this.setData({ addSpot: this.addSpot });
    },
    onShow() {
      if (
        require('../../services/features').visible('weather') &&
        require('../../services/features').enabled('weather')
      )
        void require('../../services/campus-weather')
          .load()
          .then((w) => {
            if (this.nativeVisible)
              this.setData({
                departureWeather: w.available
                  ? w.label +
                    ' · ' +
                    Math.round(w.temperature) +
                    '° · ' +
                    Math.round(w.low) +
                    '°—' +
                    Math.round(w.high) +
                    '°'
                  : '天气暂不可用，请稍后重试',
              });
          })
          .catch(() => {});
      if (api.requireLogin()) this.load();
    },
    async load() {
      this.setData({ loading: true, error: '' });
      try {
        const data = await api.request('/api/my/plans');
        this.setData({
          items: data.items.map((p) => ({ ...p, completed: p.items.filter((i) => i.done).length })),
        });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    async save(plan) {
      const wasBusy = this.data.busy;
      this.setData({ busy: true });
      try {
        await api.request('/api/my/plans/' + plan.id, 'PUT', {
          title: plan.title,
          revision: plan.revision,
          departure: plan.departure || '',
          checklist: plan.checklist || {},
          items: plan.items.map(({ id, spotId, composition, done, minutes = 5 }) => ({
            id,
            spotId,
            composition,
            done,
            minutes,
          })),
        });
        await this.load();
      } finally {
        this.setData({ busy: wasBusy });
      }
    },
    async departure(e) {
      if (this.data.busy) return;
      this.setData({ busy: true });
      const plan = JSON.parse(
        JSON.stringify(this.data.items.find((p) => p.id === e.currentTarget.dataset.id)),
      );
      try {
        const value = await this.text(
          '出发时间（北京时间 YYYY-MM-DD HH:mm）',
          plan.departure
            ? new Date(new Date(plan.departure).getTime() + 8 * 3600000)
                .toISOString()
                .slice(0, 16)
                .replace('T', ' ')
            : '',
        );
        if (value === null) return;
        if (value && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value))
          throw Error('请按 YYYY-MM-DD HH:mm 填写');
        plan.departure = value ? new Date(value.replace(' ', 'T') + ':00+08:00').toISOString() : '';
        await this.save(plan);
      } catch (err) {
        api.message(err);
      } finally {
        this.setData({ busy: false });
      }
    },
    async checklist(e) {
      if (this.data.busy) return;
      this.setData({ busy: true });
      const plan = JSON.parse(
        JSON.stringify(this.data.items.find((p) => p.id === e.currentTarget.dataset.id)),
      );
      const selected = e.detail.value;
      plan.checklist = Object.fromEntries(
        ['battery', 'storage', 'weather', 'access', 'gear'].map((k) => [k, selected.includes(k)]),
      );
      try {
        await this.save(plan);
      } catch (err) {
        api.message(err);
      } finally {
        this.setData({ busy: false });
      }
    },
    async text(title, value = '') {
      const r = await new Promise((resolve, reject) =>
        wx.showModal({
          title,
          editable: true,
          placeholderText: value,
          content: value,
          success: resolve,
          fail: reject,
        }),
      );
      return r.confirm ? r.content : null;
    },
    async create() {
      if (this.data.busy) return;
      this.setData({ busy: true });
      try {
        const title = await this.text('新清单名称');
        if (!title) return;
        await api.request('/api/my/plans', 'POST', { title, items: [] });
        await this.load();
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    async add(e) {
      if (this.data.busy) return;
      this.setData({ busy: true });
      if (!this.addSpot) {
        this.setData({ busy: false });
        return;
      }
      const plan = JSON.parse(
        JSON.stringify(this.data.items.find((p) => p.id === e.currentTarget.dataset.id)),
      );
      try {
        const composition = await this.text('想拍的构图（可留空）');
        if (composition === null) return;
        plan.items.push({ id: model.uuid(), spotId: this.addSpot, composition, done: false });
        await this.save(plan);
        api.message('已加入清单');
      } catch (error) {
        api.message(error);
      } finally {
        this.setData({ busy: false });
      }
    },
    async action(e) {
      if (this.data.busy) return;
      const { id, index, action } = e.currentTarget.dataset,
        plan = JSON.parse(JSON.stringify(this.data.items.find((p) => p.id === id))),
        n = Number(index);
      this.setData({ busy: true });
      try {
        if (action === 'share') {
          const r = await new Promise((resolve) =>
            wx.showModal({
              title: '分享拍摄计划？',
              content:
                '公开清单名称和机位，7天有效且可撤销。不包含身份、照片、完成进度与构图笔记；修改计划不会修改已分享快照。',
              success: resolve,
            }),
          );
          if (!r.confirm) return;
          const result = await api.request('/api/my/plans/' + plan.id + '/share', 'POST', {
            revision: plan.revision,
            includeComposition: false,
          });
          this.setData({ shareToken: result.token, shareTitle: plan.title });
          return;
        }
        if (action === 'revoke') {
          await api.request('/api/my/plans/' + plan.id + '/share', 'DELETE', {
            revision: plan.revision,
          });
          this.setData({ shareToken: '' });
          api.message('已撤销此计划的分享链接');
          return;
        }
        if (action === 'minutes') {
          const value = await this.text('在此停留分钟', String(plan.items[n].minutes || 5));
          if (value === null) return;
          const minutes = Number(value);
          if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)
            throw Error('停留时间为1至180分钟');
          plan.items[n].minutes = minutes;
        }
        if (action === 'done') plan.items[n].done = !plan.items[n].done;
        if (action === 'up' && n > 0)
          [plan.items[n], plan.items[n - 1]] = [plan.items[n - 1], plan.items[n]];
        if (action === 'down' && n < plan.items.length - 1)
          [plan.items[n], plan.items[n + 1]] = [plan.items[n + 1], plan.items[n]];
        if (action === 'remove') plan.items.splice(n, 1);
        if (action === 'edit') {
          const text = await this.text('想拍的构图', plan.items[n].composition);
          if (text === null) return;
          plan.items[n].composition = text;
        }
        if (action === 'rename') {
          const text = await this.text('清单名称', plan.title);
          if (!text) return;
          plan.title = text;
        }
        if (action === 'delete') {
          const answer = await new Promise((resolve) =>
            wx.showModal({
              title: '删除清单？',
              content: '仅删除计划，打卡与照片保留。',
              success: resolve,
            }),
          );
          if (!answer.confirm) return;
          await api.request('/api/my/plans/' + id, 'DELETE', { revision: plan.revision });
          await this.load();
          return;
        }
        await this.save(plan);
      } catch (error) {
        api.message(error);
        await this.load();
      } finally {
        this.setData({ busy: false });
      }
    },
    open(e) {
      const { point, spot } = e.currentTarget.dataset;
      wx.navigateTo({
        url:
          '/pages/detail/index?id=' +
          encodeURIComponent(point) +
          '&spot=' +
          encodeURIComponent(spot),
      });
    },
    copyShare() {
      wx.setClipboardData({
        data:
          require('../../services/network').backendOrigin() +
          '/#shared-plan/' +
          this.data.shareToken,
      });
    },
    onShareAppMessage() {
      return this.data.shareToken
        ? {
            title: this.data.shareTitle,
            path: '/pages/plan-share/index?id=' + this.data.shareToken,
          }
        : { title: '校园探索与拍摄', path: '/pages/discover/index' };
    },
  }),
);
