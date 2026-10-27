const admin = require('../../services/admin-api'),
  api = require('../../services/api'),
  photo = require('../../services/photo'),
  model = require('../../services/model');
const blank = {
  signedIn: false,
  account: null,
  tab: 'inbox',
  items: [],
  threads: [],
  users: [],
  announcements: [],
  conversation: null,
  messages: [],
  unread: 0,
  inboxCategory: 'all',
  inboxSelection: {},
  inboxNext: null,
  muted: false,
  loading: false,
  error: '',
  username: '',
  password: '',
  body: '',
  imageId: '',
  image: '',
  linkLabel: '',
  linkHref: '',
  selectedUser: 0,
  requestId: '',
  userId: '',
  editing: false,
  title: '',
  audience: 0,
  categoryIndex: 0,
  popup: true,
  inbox: true,
  startsAt: '',
  endsAt: '',
  selectedIds: '',
  maxTotal: '1',
  maxDaily: '1',
  intervalMinutes: '0',
  priority: '0',
  id: '',
  revision: 0,
  canMessages: false,
  canSend: false,
  canAnnouncements: false,
  canPublish: false,
};
Page(
  require('../../services/page').pageOptions(
    {
      data: { ...blank },
      onLoad(options) {
        if (options?.tab) this.setData({ tab: options.tab });
        this.submission = model.uuid();
      },
      onShow() {
        this.load();
      },
      onUnload() {
        this.serial = (this.serial || 0) + 1;
      },
      field(e) {
        this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
      },
      toggle(e) {
        this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
      },
      async login() {
        this.setData({ loading: true, error: '' });
        try {
          const s = await admin.request('/auth/login', 'POST', {
            username: this.data.username,
            password: this.data.password,
          });
          admin.saveSession(s);
          this.setData({ password: '' });
          wx.redirectTo({ url: '/pages/admin-console/index' });
        } catch (e) {
          this.setData({ error: e.message });
        } finally {
          this.setData({ loading: false });
        }
      },
      inboxCategory(e) {
        this.setData({ inboxCategory: e.currentTarget.dataset.id });
        this.load();
      },
      async inboxMore() {
        if (!this.data.inboxNext || this.data.loading) return;
        const category = this.data.inboxCategory,
          serial = this.serial;
        this.setData({ loading: true });
        try {
          const r = await admin.request(
            '/inbox?category=' +
              this.data.inboxCategory +
              '&before=' +
              encodeURIComponent(this.data.inboxNext),
          );
          if (category !== this.data.inboxCategory || serial !== this.serial) return;
          this.setData({ items: [...this.data.items, ...r.items], inboxNext: r.next });
        } catch (e) {
          api.message(e);
        } finally {
          if (serial === this.serial) this.setData({ loading: false });
        }
      },
      inboxSelect(e) {
        this.inboxSelected = e.detail.value;
        this.setData({
          inboxSelection: Object.fromEntries(e.detail.value.map((id) => [id, true])),
        });
      },
      async batchRead() {
        try {
          await admin.request('/inbox/read', 'POST', { ids: this.inboxSelected || [] });
          this.inboxSelected = [];
          await this.load();
        } catch (e) {
          api.message(e);
        }
      },
      async muteInbox() {
        try {
          const r = await new Promise((resolve, reject) =>
            wx.showActionSheet({
              itemList: ['关闭免打扰', '暂停1小时', '暂停8小时', '暂停24小时'],
              success: resolve,
              fail: reject,
            }),
          );
          await admin.request('/inbox/preferences', 'PATCH', { hours: [0, 1, 8, 24][r.tapIndex] });
          await this.load();
        } catch (e) {
          if (!/cancel/.test(e.errMsg || '')) api.message(e);
        }
      },
      console() {
        wx.navigateTo({ url: '/pages/admin-console/index' });
      },
      showInbox() {
        this.setData({ tab: 'inbox', conversation: null, editing: false });
        this.load();
      },
      async logout() {
        try {
          await admin.request('/auth/logout', 'POST', {});
        } catch (_) {}
        admin.clearSession();
        this.setData({ ...blank });
      },
      async load() {
        const session = admin.session();
        if (!session) {
          this.setData({ ...blank });
          return;
        }
        const serial = (this.serial = (this.serial || 0) + 1);
        this.setData({ loading: true, error: '' });
        try {
          const me = await admin.request('/auth/me'),
            a = me.account,
            p = a.effectivePermissions || [];
          this.setData({
            signedIn: true,
            account: a,
            canMessages: p.includes('messages.read'),
            canSend: p.includes('messages.write'),
            canAnnouncements: p.includes('announcements.read'),
            canPublish: p.includes('announcements.write'),
          });
          const bell = await admin.request('/inbox/summary');
          if (serial !== this.serial) return;
          this.setData({ unread: bell.badge ?? bell.unread });
          const contact = getApp().globalData.contactUser;
          if (contact) {
            getApp().globalData.contactUser = null;
            this.setData({
              tab: 'messages',
              userId: contact,
              requestId: '',
              editing: true,
              body: '',
            });
          }
          if (this.data.conversation) {
            const id = this.data.conversation.id,
              r = await admin.request('/conversations/' + id);
            await admin.request('/conversations/' + id + '/read', 'POST', {});
            if (serial !== this.serial) return;
            this.setData({
              conversation: r.conversation,
              messages: r.items.map((x) => ({ ...x, time: model.shortTime(x.createdAt) })),
              next: r.next,
            });
            return;
          }
          if (this.data.tab === 'inbox') {
            const r = await admin.request('/inbox?category=' + this.data.inboxCategory);
            if (serial === this.serial)
              this.setData({ items: r.items, inboxNext: r.next, inboxSelection: {} });
          } else if (this.data.tab === 'messages' && p.includes('messages.read')) {
            const [r, o] = await Promise.all([
              admin.request('/conversations'),
              admin.request('/overview'),
            ]);
            if (serial === this.serial)
              this.setData({
                threads: r.items,
                users: (o.users || []).map((u) => ({
                  ...u,
                  label: u.nickname + ' · ' + u.username,
                })),
              });
          } else if (this.data.tab === 'announcements' && p.includes('announcements.read')) {
            const r = await admin.request('/announcements');
            if (serial === this.serial)
              this.setData({ announcements: r.items.filter((row) => !row.releaseVersion) });
          }
        } catch (e) {
          this.setData({ error: e.message });
          if (!admin.session()) this.setData({ ...blank, error: e.message });
        } finally {
          this.setData({ loading: false });
        }
      },
      tab(e) {
        this.setData({
          tab: e.currentTarget.dataset.tab,
          conversation: null,
          editing: false,
          body: '',
          imageId: '',
          image: '',
          linkHref: '',
          linkLabel: '',
        });
        this.load();
      },
      async notice(e) {
        const n = this.data.items.find((x) => x.id === e.currentTarget.dataset.id);
        try {
          await admin.request('/inbox/read', 'POST', { ids: [n.id] });
          if (n.requestId && this.data.canSend) {
            this.submission = model.uuid();
            this.setData({
              tab: 'messages',
              userId: n.userId,
              requestId: n.requestId,
              body: '',
              editing: true,
              conversation: null,
            });
          } else if (n.target?.startsWith('#messages/'))
            this.openThread({ currentTarget: { dataset: { id: n.target.split('/')[1] } } });
          else if (n.target?.startsWith('#')) {
            const module = n.target.slice(1).split(/[/?]/)[0];
            wx.navigateTo({ url: '/pages/admin-console/index?module=' + module });
          } else {
            wx.showModal({
              title: n.title,
              content: n.message || '请在工作台对应栏目核对待办',
              showCancel: false,
            });
            this.load();
          }
        } catch (e) {
          api.message(e);
        }
      },
      openThread(e) {
        this.setData({
          conversation: { id: e.currentTarget.dataset.id },
          editing: false,
          body: '',
          imageId: '',
          image: '',
          linkLabel: '',
          linkHref: '',
        });
        this.load();
      },
      newThread() {
        if (!this.data.users.length)
          return api.message(Error('没有可联系的用户，或未获用户列表权限'));
        this.submission = model.uuid();
        this.setData({
          editing: true,
          userId: this.data.users[this.data.selectedUser].id,
          requestId: '',
          body: '',
          imageId: '',
          image: '',
          linkHref: '',
          linkLabel: '',
        });
      },
      async older() {
        try {
          const r = await admin.request(
            '/conversations/' +
              this.data.conversation.id +
              '?before=' +
              encodeURIComponent(this.data.next),
          );
          this.setData({
            messages: [
              ...r.items.map((x) => ({ ...x, time: model.shortTime(x.createdAt) })),
              ...this.data.messages,
            ],
            next: r.next,
          });
        } catch (e) {
          api.message(e);
        }
      },
      async choose() {
        if (this.data.loading) return;
        this.setData({ loading: true });
        try {
          const token = admin.session()?.token,
            serial = (this.photoSerial = (this.photoSerial || 0) + 1),
            p = await photo.choose(),
            canvas = await new Promise((resolve) =>
              wx
                .createSelectorQuery()
                .in(this)
                .select('#admin-photo')
                .fields({ node: true })
                .exec((r) => resolve(r[0]?.node)),
            ),
            compressed = await photo.compress(p, canvas);
          if (admin.session()?.token !== token || serial !== this.photoSerial) return;
          this.setData({ loading: true });
          const m = await admin.request('/media', 'POST', {
            photo: await photo.dataURL(compressed),
          });
          if (admin.session()?.token === token && serial === this.photoSerial)
            this.setData({ image: compressed, imageId: m.id });
        } catch (e) {
          if (!/cancel/.test(e.errMsg || '')) api.message(e);
        } finally {
          this.setData({ loading: false });
        }
      },
      removeImage() {
        this.photoSerial = (this.photoSerial || 0) + 1;
        this.setData({ image: '', imageId: '' });
      },
      rich() {
        const fileIds = this.selectComponent('#message-files')?.ids() || [];
        return {
          ...(fileIds.length ? { fileIds } : {}),
          imageId: this.data.imageId,
          links: [
            ...(this.data.linkHref
              ? [{ label: this.data.linkLabel, href: this.data.linkHref }]
              : []),
            ...(this.data.tab === 'announcements'
              ? (this.data.existing?.links || []).slice(1)
              : []),
          ],
        };
      },
      async send() {
        if (this.data.loading) return;
        this.setData({ loading: true, error: '' });
        try {
          let id = this.data.conversation?.id;
          if (id)
            await admin.request('/conversations/' + id + '/messages', 'POST', {
              body: this.data.body,
              submissionId: this.submission,
              ...this.rich(),
            });
          else {
            const r = await admin.request('/conversations', 'POST', {
              userId: this.data.userId,
              requestId: this.data.requestId,
              body: this.data.body,
              submissionId: this.submission,
              ...this.rich(),
            });
            id = r.conversation.id;
          }
          this.submission = model.uuid();
          this.selectComponent('#message-files')?.clear();
          this.setData({
            conversation: { id },
            editing: false,
            body: '',
            image: '',
            imageId: '',
            linkLabel: '',
            linkHref: '',
          });
          await this.load();
        } catch (e) {
          this.setData({ error: e.message + '；内容已保留，可重试。' });
        } finally {
          this.setData({ loading: false });
        }
      },
      async status() {
        try {
          await admin.request('/conversations/' + this.data.conversation.id, 'PATCH', {
            open: !this.data.conversation.open,
          });
          await this.load();
        } catch (e) {
          api.message(e);
        }
      },
      releaseLogs() {
        wx.navigateTo({ url: '/pages/admin-console/index?module=updates' });
      },
      newAnnouncement() {
        this.setData({
          editing: true,
          existing: null,
          id: '',
          revision: 0,
          title: '',
          body: '',
          imageId: '',
          image: '',
          linkLabel: '',
          linkHref: '',
          audience: 0,
          categoryIndex: 0,
          selectedIds: '',
          startsAt: '',
          endsAt: '',
          maxTotal: '1',
          maxDaily: '1',
          intervalMinutes: '0',
          priority: '0',
          popup: true,
          inbox: true,
        });
      },
      editAnnouncement(e) {
        const r = this.data.announcements.find((x) => x.id === e.currentTarget.dataset.id),
          v = r.draft || r.published;
        this.setData({
          editing: true,
          id: r.id,
          revision: r.revision,
          categoryIndex: ['announcement', 'activity', 'updates', 'system'].indexOf(
            v.category || 'announcement',
          ),
          title: v.title,
          body: v.body,
          imageId: v.imageId || '',
          image: v.imageId ? '/api/messages/media/' + v.imageId : '',
          linkLabel: v.links?.[0]?.label || '',
          linkHref: v.links?.[0]?.href || '',
          audience: ['all', 'members', 'scouts', 'ordinary', 'guest', 'selected'].indexOf(
            v.audience,
          ),
          selectedIds: (v.userIds || []).join('\n'),
          startsAt: v.startsAt,
          endsAt: v.endsAt,
          maxTotal: String(v.maxTotal),
          maxDaily: String(v.maxDaily),
          intervalMinutes: String(v.intervalMinutes),
          priority: String(v.priority),
          popup: !v.delivery || v.delivery.includes('popup'),
          inbox: v.delivery?.includes('inbox') || false,
          existing: v,
        });
      },
      async saveAnnouncement(e) {
        if (this.data.loading) return;
        this.setData({ loading: true, error: '' });
        try {
          for (const key of ['startsAt', 'endsAt'])
            if (this.data[key] && !/^[1-9]\d{3}-/.test(this.data[key]))
              throw Error('年份请输入4位数字');
          const d = this.data,
            content = {
              ...(d.existing || {}),
              category: ['announcement', 'activity', 'updates', 'system'][Number(d.categoryIndex)],
              title: d.title,
              body: d.body,
              channels: d.existing?.channels || ['web', 'mini'],
              pages: d.existing?.pages || [],
              audience: ['all', 'members', 'scouts', 'ordinary', 'guest', 'selected'][d.audience],
              userIds: d.audience == 5 ? d.selectedIds.split(/[\s,]+/).filter(Boolean) : [],
              startsAt: d.startsAt,
              endsAt: d.endsAt,
              maxTotal: Number(d.maxTotal),
              maxDaily: Number(d.maxDaily),
              intervalMinutes: Number(d.intervalMinutes),
              priority: Number(d.priority),
              delivery: [...(d.popup ? ['popup'] : []), ...(d.inbox ? ['inbox'] : [])],
              ...this.rich(),
            };
          await admin.request('/announcements' + (d.id ? '/' + d.id : ''), d.id ? 'PUT' : 'POST', {
            revision: d.revision,
            action: e.currentTarget.dataset.action,
            content,
          });
          this.setData({ editing: false });
          await this.load();
          wx.showToast({ title: '公告已保存' });
        } catch (e) {
          this.setData({ error: e.message });
        } finally {
          this.setData({ loading: false });
        }
      },
      deleteAnnouncement(e) {
        const r = this.data.announcements.find((x) => x.id === e.currentTarget.dataset.id);
        wx.showModal({
          title: '确认删除这条公告？',
          content: '删除后停止投放，对应消息静默移除，管理审计保留。',
          success: async (a) => {
            if (a.confirm)
              try {
                await admin.request('/announcements/' + r.id, 'DELETE', { revision: r.revision });
                await this.load();
              } catch (e) {
                api.message(e);
              }
          },
        });
      },
    },
    { administrator: true },
  ),
);
