const { pageOptions } = require('../../services/page');
const api = require('../../services/api');
Page(
  pageOptions({
    data: {
      account: null,
      nickname: '',
      currentPassword: '',
      newPassword: '',
      wechat: false,
      bound: false,
      busy: false,
      reason: '',
    },
    onShow() {
      this.load();
    },
    async load() {
      this.setData({
        account: api.session() && api.session().account,
        nickname: api.session() ? api.session().account.nickname : '',
      });
      try {
        const config = await api.request('/api/mini/config');
        this.setData({ wechat: config.wechatLogin, bound: config.wechatBound });
      } catch (e) {
        api.message(e);
      }
    },
    input(e) {
      this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    },
    async profile() {
      if (!api.requireLogin() || this.data.busy) return;
      this.setData({ busy: true });
      try {
        const result = await api.request('/api/auth/profile', 'PATCH', {
          nickname: this.data.nickname,
        });
        api.updateAccount(result.account);
        wx.showToast({ title: '已保存', icon: 'success' });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    async password() {
      if (!api.requireLogin() || this.data.busy) return;
      this.setData({ busy: true });
      try {
        const result = await api.request('/api/auth/password', 'PATCH', {
          currentPassword: this.data.currentPassword,
          newPassword: this.data.newPassword,
        });
        api.saveSession({ ...result, account: api.session().account });
        this.setData({ currentPassword: '', newPassword: '' });
        wx.showToast({ title: '密码已更新', icon: 'success' });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    bind() {
      if (!api.requireLogin() || this.data.busy) return;
      this.setData({ busy: true });
      wx.login({
        success: async (r) => {
          try {
            if (!r.code) throw Error('微信登录失败');
            await api.request('/api/mini/wechat/bind', 'POST', { code: r.code });
            this.load();
            wx.showToast({ title: '绑定成功', icon: 'success' });
          } catch (e) {
            api.message(e);
          } finally {
            this.setData({ busy: false });
          }
        },
        fail: () => {
          this.setData({ busy: false });
          api.message(Error('微信登录失败'));
        },
      });
    },
    unbind() {
      if (!this.data.currentPassword) return api.message(Error('请先在上方填写当前密码'));
      wx.showModal({
        title: '解除微信绑定？',
        content: '解除后需重新登录，已有打卡记录继续保留。',
        success: async (r) => {
          if (!r.confirm) return;
          try {
            await api.request('/api/mini/wechat/unbind', 'POST', {
              password: this.data.currentPassword,
            });
            api.clearSession();
            this.setData({ currentPassword: '' });
            this.load();
          } catch (e) {
            api.message(e);
          }
        },
      });
    },
    async apply() {
      if (!api.requireLogin() || this.data.busy) return;
      this.setData({ busy: true });
      try {
        await api.request('/api/scout/apply', 'POST', { reason: this.data.reason });
        wx.showToast({ title: '已提交申请', icon: 'success' });
      } catch (e) {
        api.message(e);
      } finally {
        this.setData({ busy: false });
      }
    },
    async logout() {
      try {
        await api.request('/api/auth/logout', 'POST');
      } catch (_) {
        /* Clear local credentials even offline. */
      }
      api.clearSession();
      wx.switchTab({ url: '/pages/my/index' });
    },
  }),
);
