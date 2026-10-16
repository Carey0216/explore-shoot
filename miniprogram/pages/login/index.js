const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: {
      register: false,
      username: '',
      password: '',
      nickname: '',
      inviteCode: '',
      loading: false,
      wechat: false,
      testWechat: false,
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
      this.setData({ register: !this.data.register, error: '' });
    },
    finish(result) {
      api.saveSession(result);
      const pages = getCurrentPages();
      if (pages.length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/shots/index' });
    },
    async submit() {
      if (this.data.loading) return;
      if (!this.data.username.trim() || !this.data.password) {
        this.setData({ error: '请输入账号和密码' });
        return;
      }
      this.setData({ loading: true, error: '' });
      try {
        const input = { username: this.data.username.trim(), password: this.data.password };
        if (this.data.register)
          Object.assign(input, {
            nickname: this.data.nickname.trim(),
            inviteCode: this.data.inviteCode.trim(),
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
            this.finish(await api.request('/api/mini/wechat/login', 'POST', { code: result.code }));
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
