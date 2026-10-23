const api = require('../../services/api'),
  { pageOptions } = require('../../services/page');
Page(
  pageOptions({
    data: {
      remaining: 0,
      paper: null,
      answers: {},
      step: 0,
      current: null,
      choices: [],
      answered: 0,
      complete: false,
      passed: false,
      loading: false,
      error: '',
      reason: '',
    },
    onShow() {
      if (!api.requireLogin()) return;
      if (!this.data.passed) this.status();
    },
    onHide() {
      clearTimeout(this.advanceTimer);
    },
    onUnload() {
      clearTimeout(this.advanceTimer);
    },
    async status() {
      try {
        const [me, status] = await Promise.all([
          api.request('/api/auth/me'),
          api.request('/api/scout/quiz'),
        ]);
        api.updateAccount(me.account);
        if (me.account.scoutStatus === 'approved')
          return wx.redirectTo({ url: '/pages/publish/index' });
        if (this.data.paper && status.remaining !== this.data.remaining) {
          clearTimeout(this.advanceTimer);
          this.setData({ paper: null, answers: {}, step: 0, error: '答题机会已刷新，请重新开始' });
        }
        this.setData({ remaining: status.remaining });
      } catch (e) {
        this.setData({ error: e.message });
      }
    },
    draw() {
      const q = this.data.paper.questions[this.data.step];
      this.setData({
        current: q,
        choices: q.options.map((text, i) => ({
          text,
          value: i,
          letter: String.fromCharCode(65 + i),
          checked: this.data.answers[q.id] === i,
        })),
        answered: Object.keys(this.data.answers).length,
        complete: this.data.paper.questions.every((q) => Number.isInteger(this.data.answers[q.id])),
      });
      wx.pageScrollTo?.({ scrollTop: 0, duration: 0 });
    },
    async start() {
      if (this.data.loading) return;
      this.setData({ loading: true, error: '' });
      try {
        const paper = await api.request('/api/scout/quiz/start', 'POST', {});
        this.setData({ paper, answers: {}, step: 0, remaining: paper.remaining });
        this.draw();
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    answer(e) {
      if (this.data.loading) return;
      const value = Number(e.detail.value);
      if (!Number.isInteger(value) || value < 0 || value >= this.data.current.options.length)
        return;
      this.setData({ ['answers.' + this.data.current.id]: value });
      this.draw();
      clearTimeout(this.advanceTimer);
      if (this.data.step < this.data.paper.questions.length - 1)
        this.advanceTimer = setTimeout(() => {
          if (this.nativeVisible) {
            this.setData({ step: this.data.step + 1 });
            this.draw();
          }
        }, 230);
    },
    previous() {
      clearTimeout(this.advanceTimer);
      this.setData({ step: Math.max(0, this.data.step - 1) });
      this.draw();
    },
    next() {
      clearTimeout(this.advanceTimer);
      if (this.data.answers[this.data.current.id] === undefined) return;
      this.setData({ step: Math.min(this.data.paper.questions.length - 1, this.data.step + 1) });
      this.draw();
    },
    reason(e) {
      this.setData({ reason: e.detail.value });
    },
    async apply() {
      try {
        await api.request('/api/scout/apply', 'POST', { reason: this.data.reason });
        api.message('申请已送达');
        wx.switchTab({ url: '/pages/my/index' });
      } catch (e) {
        api.message(e);
      }
    },
    async submit() {
      if (this.data.loading || !this.data.complete) return;
      const owner = api.session()?.account.id;
      clearTimeout(this.advanceTimer);
      this.setData({ loading: true, error: '' });
      try {
        const r = await api.request('/api/scout/quiz/submit', 'POST', {
          id: this.data.paper.id,
          answers: { ...this.data.answers },
        });
        if (owner !== api.session()?.account.id || !this.nativeVisible) return;
        if (r.passed) {
          api.updateAccount((await api.request('/api/auth/me')).account);
          this.setData({ paper: null, passed: true });
          this.selectComponent('#experience')?.celebrate('scout-passed');
        } else
          this.setData({
            paper: null,
            remaining: r.remaining,
            error: '本次答对' + r.score + '题，达到3题即可通过。可再熟悉社区规范后重试。',
          });
      } catch (e) {
        this.setData({ error: e.message });
        if (/答卷已失效/.test(e.message)) {
          this.setData({ paper: null, answers: {} });
          await this.status();
        }
      } finally {
        this.setData({ loading: false });
      }
    },
    publish() {
      wx.redirectTo({ url: '/pages/publish/index' });
    },
  }),
);
