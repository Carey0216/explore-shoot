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
        const drafts = require('../../services/plan-draft');
        for (const p of data.items) {
          const saved = drafts.read(p.id);
          if (saved) {
            p.draftNotice =
              saved.revision === p.revision
                ? '已恢复未保存的安排，核对后点击重试保存'
                : '账号已有新版本，本机旧安排仍保留，请核对后选择';
            p.staleDraft = saved.revision !== p.revision;
            if (!p.staleDraft) {
              const metadata = new Map(p.items.map((i) => [i.id, i]));
              Object.assign(p, saved.plan, {
                items: saved.plan.items.map((i) => ({ ...metadata.get(i.id), ...i })),
              });
            }
          }
        }
        const items = await Promise.all(
          data.items.map(async (p) => {
            const next = p.items.find((i) => !i.done);
            if (next) {
              try {
                const spot = await api.cached('/api/shooting-spots/' + next.spotId);
                next.spot = spot;
                next.closed = spot.pointOpen === false || spot.availability === 'closed';
                next.opening = spot.openingHours || '开放时间待核对，请先查看地点说明';
              } catch {
                next.opening = '开放检查暂不可用，计划仍已保留';
              }
            }
            return { ...p, next, completed: p.items.filter((i) => i.done).length };
          }),
        );
        this.setData({ items });
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    async save(plan) {
      if (plan.staleDraft) throw Error('请先核对并选择使用账号最新安排，本机旧稿仍保留');
      const wasBusy = this.data.busy;
      this.setData({ busy: true });
      try {
        require('../../services/plan-draft').save(plan);
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
        require('../../services/plan-draft').clear(plan.id);
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
    async retryPlan(e) {
      const plan = this.data.items.find((p) => p.id === e.currentTarget.dataset.id);
      if (!plan || plan.staleDraft || this.data.busy) return;
      try {
        await this.save(plan);
        api.message('安排已保存到账号');
      } catch (e) {
        api.message(e.message + '；安排已保留，请稍后重试');
      }
    },
    async discardPlanDraft(e) {
      const answer = await new Promise((resolve) =>
        wx.showModal({
          title: '使用账号最新安排？',
          content: '本机旧安排将丢弃，其他照片与打卡不受影响。',
          success: resolve,
        }),
      );
      if (answer.confirm) {
        require('../../services/plan-draft').clear(e.currentTarget.dataset.id);
        await this.load();
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
    nextAction(e) {
      const p = this.data.items.find((p) => p.id === e.currentTarget.dataset.id),
        next = p?.next,
        stage = e.currentTarget.dataset.stage;
      if (!next) return;
      const spot = next.spot || { id: next.spotId, pointId: next.pointId, title: next.title };
      require('../../services/photo-task').set(spot, stage);
      if (stage === 'prepare') {
        getApp().globalData.destination = spot.pointId;
        getApp().globalData.mapTab = 'navigation';
        wx.switchTab({ url: '/pages/map/index' });
      } else
        wx.navigateTo({
          url:
            stage === 'captured'
              ? '/pages/checkin/index?point=' + spot.pointId + '&spot=' + spot.id
              : '/pages/detail/index?id=' + spot.pointId + '&spot=' + spot.id,
        });
    },
    async replaceOpen(e) {
      if (this.data.busy) return;
      try {
        const catalog = await api.cached('/api/catalog');
        this.replacing = {
          plan: e.currentTarget.dataset.id,
          index: Number(e.currentTarget.dataset.index),
        };
        this.setData({
          replacePoints: catalog.points,
          replacePoint: 0,
          replaceSpot: 0,
          replaceSpots: [],
          replacing: true,
        });
        await this.replaceLoad();
      } catch (e) {
        api.message(e);
      }
    },
    async replaceLoad() {
      const point = this.data.replacePoints?.[this.data.replacePoint];
      if (!point) return;
      const serial = (this.replaceSerial = (this.replaceSerial || 0) + 1);
      this.setData({ replaceSpots: [], replaceHint: '正在读取机位…' });
      try {
        const data = await api.request('/api/points/' + point.id + '/shooting-spots');
        if (serial !== this.replaceSerial || !this.data.replacing) return;
        const spots = data.items || data.spots || [];
        this.setData({
          replaceSpots: spots,
          replaceSpot: 0,
          replaceHint: spots.length
            ? '只替换这一站，其他安排保留'
            : '这里尚无已发布机位，请换一个地点',
        });
      } catch (e) {
        if (serial === this.replaceSerial) this.setData({ replaceHint: e.message });
      }
    },
    replacePointChange(e) {
      this.setData({ replacePoint: Number(e.detail.value) });
      void this.replaceLoad();
    },
    replaceSpotChange(e) {
      this.setData({ replaceSpot: Number(e.detail.value) });
    },
    replaceClose() {
      this.replaceSerial = (this.replaceSerial || 0) + 1;
      this.setData({ replacing: false });
    },
    noop() {},
    async replaceSave() {
      if (this.data.busy) return;
      const spot = this.data.replaceSpots[this.data.replaceSpot];
      if (!spot) return;
      const plan = JSON.parse(
        JSON.stringify(this.data.items.find((p) => p.id === this.replacing.plan)),
      );
      plan.items[this.replacing.index] = {
        ...plan.items[this.replacing.index],
        spotId: spot.id,
        pointId: spot.pointId,
        title: spot.title,
        composition: '',
        done: false,
      };
      try {
        await this.save(plan);
        this.replaceClose();
        api.message('这一站已替换');
      } catch (e) {
        api.message(e);
      }
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
