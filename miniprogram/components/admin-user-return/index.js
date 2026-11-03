Component({
  properties: { locale: String, dark: Boolean, dirty: Boolean, busy: Boolean },
  methods: {
    async openUser() {
      if (this.data.busy || this.leaving) return;
      this.leaving = true;
      try {
        if (this.data.dirty) {
          const english = this.data.locale === 'en-US';
          const answer = await new Promise((resolve) =>
            wx.showModal({
              title: english ? 'Leave this edit?' : '返回用户端？',
              content: english
                ? 'Your unsaved changes will be lost. Save first if you need to keep them.'
                : '当前修改尚未保存，需要保留时请先保存。',
              confirmText: english ? 'Leave' : '返回用户端',
              cancelText: english ? 'Keep editing' : '继续编辑',
              success: resolve,
              fail: () => resolve({ confirm: false }),
            }),
          );
          if (!answer.confirm) return;
        }
        // Change the page only; user and administrator sessions remain separate.
        wx.switchTab({ url: '/pages/discover/index' });
      } finally {
        this.leaving = false;
      }
    },
  },
});
