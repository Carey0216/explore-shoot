const client = (admin) => require(admin ? '../../services/admin-api' : '../../services/api');
Component(
  require('../../services/localization').component({
    properties: {
      conversationId: String,
      userId: String,
      administrator: Boolean,
      disabled: Boolean,
    },
    data: { rows: [], hint: '', busy: false },
    lifetimes: {
      attached() {
        this.mounted = true;
      },
      detached() {
        this.mounted = false;
        this.serial = (this.serial || 0) + 1;
      },
    },
    observers: {
      'conversationId,userId,administrator': function () {
        this.clear();
      },
    },
    methods: {
      clear() {
        this.serial = (this.serial || 0) + 1;
        this.setData({ rows: [], hint: '', busy: false });
      },
      ids() {
        if (this.data.rows.some((r) => r.state !== 'ready'))
          throw Error('文件尚未上传成功，请重试或移除失败文件');
        return this.data.rows.map((r) => r.id);
      },
      async choose() {
        if (this.data.disabled || this.data.busy) return;
        if (this.data.rows.length >= 3) {
          this.setData({ hint: '每条消息最多3个文件' });
          return;
        }
        const serial = this.serial,
          auth = client(this.data.administrator).session();
        try {
          if (!auth) throw Error('请先登录后选择文件');
          await require('../../services/privacy').authorize();
          const selected = await new Promise((resolve, reject) =>
            wx.chooseMessageFile({
              count: 3 - this.data.rows.length,
              type: 'file',
              success: resolve,
              fail: reject,
            }),
          );
          if (
            !this.mounted ||
            serial !== this.serial ||
            client(this.data.administrator).session()?.token !== auth?.token
          )
            return;
          const rows = [...this.data.rows];
          let hint = '';
          for (const f of selected.tempFiles || []) {
            if (rows.length >= 3) break;
            if (!f.size || f.size > 10 * 1024 * 1024) {
              hint = '请选择非空且不超过10MB的文件';
              continue;
            }
            rows.push({
              fileName: f.name,
              filePath: f.path,
              size: f.size,
              sizeLabel:
                f.size >= 1048576
                  ? (f.size / 1048576).toFixed(1) + ' MB'
                  : Math.ceil(f.size / 1024) + ' KB',
              submission: require('../../services/model').uuid(),
              state: 'pending',
              error: '',
            });
          }
          this.setData({ rows, hint });
          for (let i = 0; i < rows.length; i++)
            if (rows[i].state === 'pending') await this.upload(i);
        } catch (e) {
          if (!/cancel/.test(e.errMsg || ''))
            this.setData({ hint: e.message || '文件选择失败，请重试' });
        }
      },
      async upload(index) {
        const row = this.data.rows[index];
        if (!row) return;
        const serial = this.serial,
          admin = this.data.administrator,
          api = client(admin),
          auth = api.session(),
          origin = require('../../services/network').configuredOrigin();
        const alive = () =>
          this.mounted &&
          serial === this.serial &&
          api.session()?.token === auth?.token &&
          origin === require('../../services/network').configuredOrigin();
        this.setData({
          busy: true,
          ['rows[' + index + '].state']: 'uploading',
          ['rows[' + index + '].error']: '',
        });
        try {
          if (!alive()) return;
          const saved = await api.uploadMessageFile(
            row.filePath,
            {
              name: row.fileName,
              submissionId: row.submission,
              conversationId: this.data.conversationId || '',
              userId: this.data.userId || '',
            },
            (progress) => {
              if (alive()) this.setData({ ['rows[' + index + '].progress']: progress });
            },
          );
          if (alive())
            this.setData({
              ['rows[' + index + '].id']: saved.id,
              ['rows[' + index + '].state']: 'ready',
            });
        } catch (e) {
          if (alive())
            this.setData({
              ['rows[' + index + '].state']: 'failed',
              ['rows[' + index + '].error']: e.message || '上传失败，文件仍保留，可重试',
            });
        } finally {
          if (alive()) this.setData({ busy: false });
        }
      },
      retry(e) {
        if (!this.data.busy) void this.upload(Number(e.currentTarget.dataset.index));
      },
      remove(e) {
        if (this.data.busy || this.data.disabled) return;
        const rows = [...this.data.rows];
        rows.splice(Number(e.currentTarget.dataset.index), 1);
        this.setData({ rows, hint: '' });
      },
    },
  }),
);
