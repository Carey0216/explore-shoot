const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: {
      register: false,
      username: '',
      password: '',
      nickname: '',
      loading: false,
      wechat: false,
      testWechat: false,
      onboarding: false,
      binding: false,
      confirm: '',
      error: '',
    },
    onLoad() {
      api
        .request('/api/mini/config')
        .then((c) => this.setData({ wechat: c.wechatLogin, testWechat: !!c.wechatTestLogin }))
        .catch(() => {});
    },
    input(e) {
      this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    },
    toggle() {
      if (this.data.loading) return;
      this.setData({ register: !this.data.register, error: '' });
    },
    chooseAccount(e) {
      this.setData({
        binding: e.currentTarget.dataset.action === 'bind',
        password: '',
        confirm: '',
        error: '',
      });
    },
    cancelWechat() {
      this.wechatTicket = null;
      this.setData({ onboarding: false, password: '', confirm: '', error: '' });
    },
    onHide() {
      this.cancelWechat();
    },
    finish(result) {
      api.saveSession(result);
      const pages = getCurrentPages();
      if (pages.length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/discover/index' });
    },
    async submit() {
      if (this.data.loading) return;
      if (!this.data.username.trim() || !this.data.password) {
        this.setData({ error: '请输入账号和密码' });
        return;
      }
      this.setData({ loading: true, error: '' });
      try {
        if (this.data.onboarding) {
          if (!this.data.binding && this.data.password !== this.data.confirm)
            throw Error('两次输入的密码不一致');
          if (!this.wechatTicket) throw Error('请重新点击微信登录');
          const result = await api.request('/api/mini/wechat/complete', 'POST', {
            ticket: this.wechatTicket,
            action: this.data.binding ? 'bind' : 'create',
            username: this.data.username.trim(),
            password: this.data.password,
            ...(!this.data.binding
              ? { nickname: this.data.nickname.trim() || this.data.username.trim() }
              : {}),
          });
          this.wechatTicket = null;
          this.setData({ password: '', confirm: '' });
          this.finish(result);
          return;
        }
        const input = { username: this.data.username.trim(), password: this.data.password };
        if (this.data.register)
          Object.assign(input, {
            nickname: this.data.nickname.trim(),
          });
        const result = await api.request(
          '/api/auth/' + (this.data.register ? 'register' : 'login'),
          'POST',
          input,
        );
        this.setData({ password: '' });
        this.finish(result);
      } catch (e) {
        this.setData({ error: e.message });
      } finally {
        this.setData({ loading: false });
      }
    },
    wechat() {
      if (this.data.loading) return;
      this.setData({ loading: true, error: '' });
      wx.login({
        success: async (result) => {
          try {
            if (!result.code) throw Error('微信登录失败');
            const response = await api.request('/api/mini/wechat/login', 'POST', {
              code: result.code,
            });
            if (response.onboardingRequired) {
              this.wechatTicket = response.ticket;
              this.setData({
                onboarding: true,
                binding: true,
                password: '',
                confirm: '',
                error: '',
              });
            } else this.finish(response);
          } catch (e) {
            this.setData({ error: e.message });
          } finally {
            this.setData({ loading: false });
          }
        },
        fail: () => this.setData({ loading: false, error: '微信登录失败，请重试' }),
      });
    },
  }),
);
