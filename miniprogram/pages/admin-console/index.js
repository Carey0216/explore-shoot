const admin = require('../../services/admin-api'),
  api = require('../../services/api'),
  modules = require('../../services/admin-modules'),
  forms = require('../../services/form-model'),
  { pageOptions } = require('../../services/page');
const createModules = new Set([
  'admins',
  'shooting-spots',
  'guides',
  'passport',
  'topics',
  'knowledge',
  'announcements',
  'campus-map',
]);
const configModules = new Set([
  'features',
  'scout-quiz',
  'site-content',
  'ai-settings',
  'support-settings',
  'celebrations',
  'map-config',
]);
const states = {
  pending: '待审核',
  approved: '已通过',
  published: '已发布',
  rejected: '未通过',
  resolved: '已处理',
  draft: '草稿',
  hidden: '已隐藏',
  withdrawn: '已撤回',
  none: '普通用户',
  super: '超级管理员',
  normal: '普通管理员',
  owner: '顶级管理员',
};
Page(
  pageOptions(
    {
      data: {
        account: null,
        module: 'overview',
        title: '管理工作台',
        groups: [],
        entries: [],
        activeGroup: 'overview',
        rows: [],
        visibleRows: [],
        query: '',
        loading: false,
        error: '',
        busy: false,
        editor: null,
        formFields: [],
        formError: '',
        previewText: '',
        selected: [],
        selectedMap: {},
        reviewKind: 'applications',
        reviewStatus: 'pending',
        reviewStatusLabel: '待审核',
        reviewKindLabel: '探索官申请',
        recordCategoryLabel: '全部分类',
        recordRoleLabel: '全部操作者',
        reviewStates: [
          { id: 'all', title: '全部状态' },
          { id: 'pending', title: '待审核' },
          { id: 'approved', title: '已通过' },
          { id: 'published', title: '已发布' },
          { id: 'rejected', title: '未采纳' },
          { id: 'resolved', title: '已处理' },
        ],
        recordKind: 'audit',
        recordCategory: 'all',
        recordRole: 'all',
        recordFrom: '',
        recordTo: '',
        recordKinds: [
          { id: 'audit', title: '操作记录' },
          { id: 'planning', title: '路线校验' },
        ],
        recordCategories: [
          { id: 'all', title: '全部分类' },
          ...Object.entries({
            account: '账号',
            community: '社区审核',
            content: '点位与任务',
            deletion: '删除与验证',
            security: '权限与密码',
            settings: '个人与服务',
            quiz: '答题',
            activity: '活动',
            passport: '护照',
            ai: '助手',
            other: '其他',
          }).map(([id, title]) => ({ id, title })),
        ],
        recordRoles: [
          { id: 'all', title: '全部操作者' },
          { id: 'owner', title: '顶管' },
          { id: 'super', title: '超级管理员' },
          { id: 'normal', title: '普通管理员' },
          { id: 'user', title: '用户' },
        ],

        reviewKinds: [],
        next: null,
        page: 1,
        hasMore: false,
        summary: [],
        readBody: '',
        appearanceIndex: 0,
        deleteReady: null,
        viewer: null,
        canStatistics: false,
      },
      onLoad(o) {
        this.module = o.module || 'overview';
      },
      onShow() {
        if (!admin.session()) return wx.redirectTo({ url: '/pages/admin/index' });
        if (this.previewingModel) {
          this.previewingModel = false;
          if (this.previewOwner === admin.session().account.id) return;
          this.cancelEditor();
        }
        this.load();
      },
      onHide() {
        if (!this.previewingModel) this.cancelEditor();
        this.serial = (this.serial || 0) + 1;
      },
      onUnload() {
        this.cancelEditor();
        this.serial = (this.serial || 0) + 1;
      },
      async load(more = false) {
        if (typeof more !== 'boolean') more = false;
        if (this.data.busy) return;
        const serial = (this.serial = (this.serial || 0) + 1),
          owner = admin.session()?.account.id;
        this.setData({ loading: true, error: '' });
        try {
          const me = await admin.request('/auth/me');
          if (serial !== this.serial || owner !== admin.session()?.account.id) return;
          admin.updateAccount(me.account);
          const account = me.account;
          require('../../services/appearance').account(account, true);
          if (!modules.can(account, this.module)) throw Error('当前账号未获此功能授权');
          const groups = modules.menu(account),
            group = groups.find((g) => g.entries.some((e) => e.id === this.module)) || groups[0];
          this.setData({
            account,
            groups,
            entries: group.entries,
            activeGroup: group.id,
            module: this.module,
            title: modules.titles[this.module],
            canCreate: modules.can(account, this.module, 'write') && createModules.has(this.module),
            canWrite: modules.can(account, this.module, 'write'),
            isConfig: configModules.has(this.module),
          });
          wx.setNavigationBarTitle({ title: modules.titles[this.module] });
          const needFull = [
            'users',
            'applications',
            'points',
            'shooting-spots',
            'works',
            'work-reports',
            'reports',
            'routes',
            'templates',
            'admins',
            'guides',
            'topics',
            'passport',
            'buildings',
            'campus-map',
            'knowledge',
          ].includes(this.module);
          this.overview = await admin.request('/overview' + (needFull ? '' : '?compact=1'));
          let endpoint = modules.source(this.module);
          if (this.module === 'review-queue') {
            const allowed = [
              'applications',
              'works',
              'shooting-spots',
              'reports',
              'work-reports',
            ].filter((n) => modules.can(account, n));
            const kind = allowed.includes(this.data.reviewKind) ? this.data.reviewKind : allowed[0];
            this.setData({
              reviewKind: kind,
              reviewKindLabel: modules.titles[kind],
              reviewKinds: allowed.map((id) => ({ id, title: modules.titles[id] })),
              canWrite: modules.can(account, kind, 'write'),
            });
            endpoint =
              '/review-queue?kind=' +
              kind +
              '&status=' +
              this.data.reviewStatus +
              '&page=' +
              (more ? this.data.page + 1 : 1) +
              '&query=' +
              encodeURIComponent(this.data.query);
          }
          if (this.module === 'audit')
            endpoint =
              '/records?kind=' +
              this.data.recordKind +
              '&category=' +
              this.data.recordCategory +
              '&role=' +
              this.data.recordRole +
              '&from=' +
              this.data.recordFrom +
              '&to=' +
              this.data.recordTo +
              '&q=' +
              encodeURIComponent(this.data.query) +
              (more && this.data.next ? '&before=' + encodeURIComponent(this.data.next) : '');
          this.moduleData = endpoint ? await admin.request(endpoint) : {};
          if (
            serial !== this.serial ||
            owner !== admin.session()?.account.id ||
            !this.nativeVisible
          )
            return;
          let raw = modules.rows(this.module, this.moduleData, this.overview);
          if (more) raw = [...(this.rawRows || []), ...raw];
          this.rawRows = raw;
          const rows = raw.map((row) => ({
            id: row.id,
            title:
              row.draft?.title ||
              row.title ||
              row.name ||
              row.nickname ||
              row.routeName ||
              row.route ||
              row.action ||
              row.id,
            description:
              row.description ||
              row.reason ||
              row.message ||
              row.draft?.body ||
              row.body ||
              row.note ||
              row.detail ||
              row.standDescription ||
              '',
            status:
              states[row.status] ||
              (row.published
                ? '已发布'
                : row.enabled === false
                  ? '已停用'
                  : row.enabled === true
                    ? '正常'
                    : ''),
            time: row.createdAt || row.at || '',
            photo: row.photo || row.cover || '',
            pending: row.status === 'pending',
            revision: row.revision || 0,
            username: row.username || '',
            identity: row.scoutStatus
              ? row.scoutStatus === 'approved'
                ? '校园探索官'
                : '普通用户'
              : '',
            version: row.version || '',
            badge: row.badgePreset
              ? api.asset('/shared/badges/' + row.badgePreset + '.png', false)
              : '',
          }));
          const summary = this.overview.summary || {};
          this.setData({
            canStatistics:
              ['owner', 'super'].includes(account.role) &&
              !!account.effectivePermissions?.includes('statistics.write'),
            rows,
            visibleRows: rows,
            selected: [],
            selectedMap: {},
            next: this.moduleData.nextBefore || null,
            hasMore: !!this.moduleData.hasMore,
            page: more ? this.data.page + 1 : 1,
            summary: [
              ['已发布点位', summary.publishedPoints],
              ['注册用户', summary.users],
              ['待审申请', summary.pendingApplications],
              ['待处理反馈', summary.pendingReports],
            ].map(([title, value]) => ({ title, value: value || 0 })),
            readBody: this.module === 'updates' ? this.moduleData.body : '',
            appearanceIndex: ['system', 'light', 'dark'].indexOf(
              require('../../services/appearance').snapshot().appearance,
            ),
          });
          if (configModules.has(this.module) && this.module !== 'map-config')
            this.editRecord(
              { id: 'configuration' },
              this.module,
              !modules.can(account, this.module, 'write'),
            );
        } catch (e) {
          if (serial === this.serial) this.setData({ error: e.message });
        } finally {
          if (serial === this.serial) this.setData({ loading: false });
        }
      },
      field(e) {
        this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
        if (e.currentTarget.dataset.key === 'query') {
          const q = e.detail.value.trim().toLowerCase();
          this.setData({
            visibleRows: this.data.rows.filter((r) =>
              (r.title + ' ' + r.description + ' ' + r.username).toLowerCase().includes(q),
            ),
          });
        }
      },
      openModule(e) {
        this.navigate(e.currentTarget.dataset.id);
      },
      navigate(module) {
        if (['inbox', 'messages'].includes(module)) {
          getApp().globalData.nativeAdminTab = module;
          return wx.navigateTo({ url: '/pages/admin/index?tab=' + module });
        }
        if (module === this.module) return;
        wx.redirectTo({ url: '/pages/admin-console/index?module=' + module });
      },
      group(e) {
        const g = this.data.groups.find((g) => g.id === e.currentTarget.dataset.id);
        if (g) this.navigate(g.entries[0].id);
      },
      async reviewKind(e) {
        this.setData({
          reviewKind: this.data.reviewKinds[Number(e.detail.value)].id,
          reviewStatus: 'pending',
          reviewStatusLabel: '待审核',
          reviewKindLabel: this.data.reviewKinds[Number(e.detail.value)].title,
          page: 1,
          selected: [],
          selectedMap: {},
        });
        this.load();
      },
      reviewState(e) {
        this.setData({
          reviewStatus: this.data.reviewStates[Number(e.detail.value)].id,
          reviewStatusLabel: this.data.reviewStates[Number(e.detail.value)].title,
        });
        this.load();
      },
      recordFilter(e) {
        const key = e.currentTarget.dataset.key,
          options = {
            recordKind: this.data.recordKinds,
            recordCategory: this.data.recordCategories,
            recordRole: this.data.recordRoles,
          };
        this.setData({
          [key]: options[key] ? options[key][Number(e.detail.value)].id : e.detail.value,
          ...(options[key] ? { [key + 'Label']: options[key][Number(e.detail.value)].title } : {}),
        });
        this.load();
      },
      resetRecords() {
        this.setData({
          recordCategory: 'all',
          recordRole: 'all',
          recordFrom: '',
          recordTo: '',
          recordCategoryLabel: '全部分类',
          recordRoleLabel: '全部操作者',
          query: '',
        });
        this.load();
      },
      deleteRecords() {
        if (this.data.account.role !== 'owner' || !this.data.selected.length)
          return api.message('请先选择记录');
        this.config = {
          name: 'audit',
          kind: 'plain',
          endpoint: '/records',
          method: 'DELETE',
          base: { ids: this.data.selected, kind: this.data.recordKind },
          fields: [
            modules.F('currentPassword', '当前顶级管理员密码', 'password', { required: true }),
          ],
          actions: ['save'],
        };
        this.setData({
          editor: {
            title: '从列表移除所选记录？',
            hint: '不删除用户打卡、照片或底层审计；需验证顶管密码。',
            actions: ['save'],
          },
          formFields: forms.fields(this.config.fields, {}),
          canDelete: false,
        });
      },
      redrawBuilding(e) {
        if (this.data.account?.role !== 'owner') return;
        wx.navigateTo({
          url: '/scenes/atlas-editor/index?id=' + encodeURIComponent(e.currentTarget.dataset.id),
        });
      },
      async edit(e) {
        const row = this.rawRows.find((r) => r.id === e.currentTarget.dataset.id);
        if (this.module === 'updates') {
          try {
            const r = await admin.request('/announcements');
            const item = r.items.find((r) => r.id === row.id);
            if (!item) throw Error('草稿已变化，请刷新');
            this.editRecord(item, 'announcements');
          } catch (e) {
            api.message(e);
          }
          return;
        }
        this.editRecord(row);
      },
      create() {
        this.editRecord({});
      },
      async editRecord(old = {}, name = this.module, readonly = false) {
        if (
          !modules.can(this.data.account, name, readonly ? 'read' : 'write') &&
          !['settings', 'map-config'].includes(name)
        )
          return;
        if (name === 'admins' && old.role === 'owner') {
          this.navigate('settings');
          return;
        }
        try {
          let rules = [];
          if (name === 'topics') rules = (await admin.request('/passport')).themes;
          if (name === 'permissions') this.permissions = await admin.request('/permissions');
          this.config = modules.schema(name, old, {
            overview: this.overview,
            data: this.moduleData,
            account: this.data.account,
            rules,
            permissions: this.permissions,
          });
          this.original = JSON.parse(JSON.stringify(old));
          this.setData({
            editor: {
              title: this.config.title,
              hint: this.config.hint,
              readonly,
              actions: readonly ? [] : this.config.actions,
              kind: this.config.kind,
            },
            formFields: forms.fields(this.config.fields, this.config.initial),
            formError: '',
            previewText: '',
            canDelete:
              [
                'users',
                'admins',
                'announcements',
                'topics',
                'guides',
                'points',
                'routes',
                'templates',
              ].includes(name) && !!old.id,
          });
        } catch (e) {
          api.message(e);
        }
      },
      mapConfiguration(e) {
        this.configureMap(e.currentTarget.dataset.mode);
      },
      configureMap(mode) {
        if (!this.verification || !this.mapSettings || Date.now() >= this.mapExpires) {
          this.cancelEditor();
          return;
        }
        const settings = this.mapSettings,
          mini = settings.mini || { provider: 'tencent', revision: 0, keyConfigured: {} };
        const native = mode === 'mini';
        const fields = native
          ? [
              modules.P(
                'provider',
                '小程序步行路线服务',
                { tencent: '腾讯', amap: '高德', baidu: '百度' },
                mini.provider,
              ),
              ...Object.entries({ tencent: '腾讯', amap: '高德', baidu: '百度' }).map(
                ([id, label]) =>
                  modules.F(
                    { tencent: 'miniTencentKey', amap: 'miniAmapKey', baidu: 'miniBaiduKey' }[id],
                    label +
                      ' Web服务Key（' +
                      (mini.keyConfigured?.[id] ? '已配置；留空保留' : '尚未配置') +
                      '）',
                    'password',
                    { omitEmpty: true },
                  ),
              ),
            ]
          : [
              modules.P(
                'mapProvider',
                '网页地图服务',
                { tencent: '腾讯', amap: '高德', baidu: '百度' },
                settings.mapProvider,
              ),
              modules.F('tencentKey', '腾讯Key'),
              modules.F('amapKey', '高德Key'),
              modules.F('amapSecurity', '高德安全密钥（留空保持）', 'password', {
                omitEmpty: true,
              }),
              modules.F('baiduKey', '百度Key'),
              modules.B('activate', '启用所选服务', true),
              modules.B('clearAmapSecurity', '清除高德安全密钥'),
            ];
        this.config = {
          name: 'map-config',
          title: native ? '小程序地图服务' : '网页地图SDK',
          kind: native ? 'mini-sdk' : 'sdk',
          endpoint: native ? '/map-config/mini' : '/settings',
          method: native ? 'POST' : 'PATCH',
          base: { verification: this.verification, ...(native ? { revision: mini.revision } : {}) },
          fields,
          actions: ['save'],
        };
        this.setData({
          editor: {
            title: this.config.title,
            hint: native
              ? '底图由微信提供；独立切换路线服务，密钥仅保存在服务器。留空保留。'
              : '授权3分钟，离开页面自动清理。',
            actions: ['save'],
            kind: this.config.kind,
          },
          formFields: forms.fields(fields, native ? { provider: mini.provider } : settings),
          formError: '',
        });
      },
      cancelEditor() {
        clearTimeout(this.mapExpiryTimer);
        this.mapSettings = null;
        this.mapExpires = 0;
        if (this.verification) {
          admin
            .request('/map-config/lock', 'POST', { verification: this.verification })
            .catch(() => {});
          this.verification = null;
        }
        this.config = null;
        this.original = null;
        this.setData({
          editor: null,
          viewer: null,
          formFields: [],
          formError: '',
          previewText: '',
          deleteReady: null,
        });
      },
      closeEditor() {
        if (!this.data.busy) this.cancelEditor();
      },
      noop() {},
      async save(e) {
        if (this.data.busy || !this.config || this.data.editor?.readonly) return;
        const action = e.currentTarget.dataset.action || 'save';
        try {
          const value = this.selectComponent('#editor-fields').read(),
            config = this.config,
            owner = admin.session()?.account.id;
          if (action === 'preview') {
            this.setData({
              previewText: [
                value.title || value.siteName || config.title,
                value.body || value.about || '',
                value.adminBody || '',
              ]
                .filter(Boolean)
                .join('\n\n'),
            });
            return;
          }
          if (action === 'publish') {
            const answer = await new Promise((resolve) =>
              wx.showModal({
                title: '确认发布到客户端？',
                content: '发布后按所选人群和端投递。请确认文案、时间、入口与公开配图。',
                confirmText: '确认发布',
                success: resolve,
              }),
            );
            if (!answer.confirm) return;
          }
          if (config.name === 'users' && !value.confirmed) throw Error('请先确认账号调整的影响');
          let payload = modules.payload(config, value, action);
          if (config.name === 'users') {
            payload = { confirmed: true };
            for (const key of ['username', 'nickname', 'enabled', 'scoutStatus'])
              if (
                value[key] !== this.original[key] &&
                !(
                  key === 'scoutStatus' &&
                  this.original.scoutStatus !== 'approved' &&
                  value[key] === 'none'
                )
              )
                payload[key] = value[key];
            if (value.password) payload.password = value.password;
          }
          this.setData({ busy: true, formError: '' });
          if (config.kind === 'account') {
            const { nickname, currentPassword, newPassword } = value;
            if (nickname)
              admin.updateAccount(
                (await admin.request('/auth/profile', 'PATCH', { nickname })).account,
              );
            if (newPassword) {
              const result = await admin.request('/auth/password', 'PATCH', {
                currentPassword,
                newPassword,
              });
              admin.saveSession({ ...result, account: admin.session().account });
            }
          } else if (config.kind === 'unlock') {
            const result = await admin.request(config.endpoint, config.method, payload);
            this.verification = result.token;
            const settings = await admin.request('/map-config/read', 'POST', {
              verification: this.verification,
            });
            if (owner !== admin.session()?.account.id) throw Error('管理账号已改变');
            this.mapSettings = settings;
            this.mapExpires = result.expiresAt;
            clearTimeout(this.mapExpiryTimer);
            this.mapExpiryTimer = setTimeout(
              () => this.cancelEditor(),
              Math.max(0, result.expiresAt - Date.now()),
            );
            this.configureMap('web');
            return;
          } else if (config.kind === 'delete-prepare') {
            const prepared = await admin.request('/content-deletion/prepare', 'POST', payload);
            this.deleteToken = prepared.confirmationToken;
            const p = prepared.preview;
            this.config = {
              kind: 'delete-commit',
              name: config.name,
              endpoint: '/content-deletion/commit',
              method: 'POST',
              base: { confirmationToken: this.deleteToken },
              fields: [
                modules.F('scope', '即将永久删除的范围', 'readonly'),
                modules.B('confirmed', '我已确认内容与不可逆删除'),
              ],
              actions: ['save'],
            };
            this.setData({
              editor: {
                title: '最后确认 · 第2步',
                hint: '永久删除不能从客户端撤销，必要备份不会在这里被清理。',
                actions: ['save'],
                kind: 'delete-commit',
              },
              formFields: forms.fields(this.config.fields, {
                scope:
                  '目标：' +
                  (p.name || p.id || '') +
                  '\n关联模板：' +
                  (p.relatedTemplates || 0) +
                  '\n相关照片：' +
                  (p.deletedPhotos || 0) +
                  '\n受影响路线：' +
                  (p.affectedRoutes || 0),
              }),
            });
            return;
          } else if (config.kind === 'delete-commit') {
            if (!value.confirmed) throw Error('请确认不可逆删除');
            await admin.request(config.endpoint, 'POST', {
              confirmationToken: this.deleteToken,
              confirmed: true,
            });
          } else {
            const result = await admin.request(
              config.kind === 'map-model' && action === 'unpublish'
                ? config.endpoint + '/unpublish'
                : config.endpoint,
              config.kind === 'map-model' && action === 'unpublish' ? 'POST' : config.method,
              payload,
            );
            if (result.loginRequired) {
              admin.clearSession();
              wx.redirectTo({ url: '/pages/admin/index' });
              return;
            }
          }
          if (owner !== admin.session()?.account.id) return;
          this.cancelEditor();
          this.setData({ busy: false });
          api.message('已保存');
          await this.load();
        } catch (e) {
          this.setData({ formError: e.message || '保存失败，请检查输入' });
        } finally {
          this.setData({ busy: false });
        }
      },
      async remove() {
        if (!this.original?.id || this.data.busy) return;
        const name = this.config.name,
          row = this.original;
        if (['points', 'routes', 'templates'].includes(name)) {
          this.config = {
            name,
            kind: 'delete-prepare',
            endpoint: '/content-deletion/prepare',
            method: 'POST',
            base: { type: name, id: row.id },
            fields: [
              modules.F('password', '当前管理员密码', 'password', { required: true }),
              modules.B('remember', '15分钟内记住本次验证'),
            ],
            actions: ['save'],
          };
          this.setData({
            editor: {
              title: '永久删除 · 第1步',
              hint: '先验证身份，再查看删除范围和二次确认。',
              actions: ['save'],
              kind: 'delete-prepare',
            },
            formFields: forms.fields(this.config.fields, {}),
          });
          return;
        }
        const r = await new Promise((resolve) =>
          wx.showModal({
            title: '确认删除？',
            content: '将删除所选' + modules.titles[name] + '。账号关联内容和审计按现有规则保留。',
            confirmText: '确认删除',
            success: resolve,
          }),
        );
        if (!r.confirm) return;
        this.setData({ busy: true });
        try {
          await admin.request(
            '/' + name + '/' + row.id,
            'DELETE',
            row.revision ? { revision: row.revision } : {},
          );
          this.cancelEditor();
          this.setData({ busy: false });
          await this.load();
        } catch (e) {
          this.setData({ formError: e.message });
        } finally {
          this.setData({ busy: false });
        }
      },
      viewRecord(e) {
        const row = this.rawRows?.find((r) => r.id === e.currentTarget.dataset.id);
        if (!row) return;
        const labels = {
          username: '账号',
          nickname: '昵称',
          name: '名称',
          title: '标题',
          description: '介绍',
          source: '资料依据',
          standDescription: '真实站位',
          compositionTip: '构图建议',
          lng: '经度（WGS84）',
          lat: '纬度（WGS84）',
          bearing: '拍摄朝向',
          heading: '模型朝向',
          scale: '模型比例',
          altitude: '模型高度偏移',
          createdAt: '创建时间',
          updatedAt: '更新时间',
          startsAt: '开始时间',
          endsAt: '结束时间',
          enabled: '账号可用',
          published: '已发布',
          confirmed: '已核实',
          status: '状态',
          role: '角色',
          scoutStatus: '探索官身份',
          reason: '说明',
          note: '处理意见',
          body: '正文',
          caption: '配文',
          bestTime: '适合时间',
          openingHours: '开放时间',
          accessNotice: '通行提醒',
          revision: '修订',
          verifiedAt: '核验日期',
          routeName: '路线',
          action: '操作',
          detail: '记录',
          actorRole: '操作角色',
          actorName: '操作人',
          actor: '操作账号',
          actorId: '操作者编号',
          ip: '来源IP',
          contentType: '内容类别',
          subject: '操作对象',
          route: '路线',
          total: '计划分钟',
          budget: '预算分钟',
          version: '数据版本',
          steps: '步骤',
        };
        const fields = Object.entries(labels)
          .filter(([key]) => row[key] !== undefined && row[key] !== null && row[key] !== '')
          .map(([key, label]) => ({
            label,
            value: Array.isArray(row[key])
              ? row[key].filter((v) => typeof v === 'string').join('\n')
              : typeof row[key] === 'boolean'
                ? row[key]
                  ? '是'
                  : '否'
                : states[row[key]] || String(row[key]),
          }));
        if (
          ['owner', 'super'].includes(this.data.account.role) &&
          this.data.account.effectivePermissions?.includes('statistics.read')
        )
          for (const [key, label] of [
            ['viewCount', '浏览量'],
            ['popularity', '排序热度'],
          ])
            if (row[key] !== undefined) fields.push({ label, value: String(row[key]) });
        this.setData({
          viewer: { title: row.title || row.name || row.nickname || '记录详情', fields },
        });
      },
      closeViewer() {
        this.setData({ viewer: null });
      },
      async permissions(e) {
        if (this.data.account.role !== 'owner') return;
        const row = this.overview.admins.find((a) => a.id === e.currentTarget.dataset.id);
        if (row && row.role !== 'owner') this.editRecord(row, 'permissions');
      },
      editAvatar() {
        wx.navigateTo({ url: '/pages/avatar/index?admin=1' });
      },
      ownerAccount() {
        if (this.data.account.role === 'owner') this.editRecord({}, 'owner-account');
      },
      async popularity(e) {
        if (!this.data.account.effectivePermissions?.includes('statistics.write')) return;
        const p = this.overview.points.find((p) => p.id === e.currentTarget.dataset.id);
        this.config = {
          name: 'points',
          kind: 'plain',
          endpoint: '/points/' + p.id + '/popularity',
          method: 'PATCH',
          base: {},
          fields: [modules.N('popularity', '展示热度', p.popularity || 0, 0, 1000000000)],
          actions: ['save'],
        };
        this.setData({
          editor: {
            title: '维护展示热度',
            hint: '仅获统计权限的超级管理员可见。',
            actions: ['save'],
          },
          formFields: forms.fields(this.config.fields, {}),
        });
      },
      async appearance(e) {
        try {
          await require('../../services/appearance').update(
            { appearance: ['system', 'light', 'dark'][Number(e.detail.value)] },
            true,
          );
          this.setData({ appearanceIndex: Number(e.detail.value) });
        } catch (e) {
          api.message(e);
        }
      },
      previewModel() {
        try {
          const value = this.selectComponent('#editor-fields').read();
          this.previewingModel = true;
          this.previewOwner = admin.session().account.id;
          getApp().globalData.mapModelPreview = {
            owner: admin.session().account.id,
            origin: require('../../services/network').configuredOrigin(),
            value,
          };
          wx.navigateTo({
            url: '/scenes/campus/index?mode=placement&admin=1',
            fail: () => {
              this.previewingModel = false;
            },
          });
        } catch (e) {
          api.message(e);
        }
      },
      async previewEffect() {
        this.selectComponent('#experience')?.play();
      },
      selection(e) {
        const ids = e.detail.value.slice(0, this.module === 'audit' ? 100 : 12);
        this.setData({
          selected: ids,
          selectedMap: Object.fromEntries(ids.map((id) => [id, true])),
        });
      },
      async batch(e) {
        if (!this.data.selected.length) return api.message('请选择1至12条记录');
        const items = this.rawRows
          .filter((r) => this.data.selected.includes(r.id))
          .map(({ id, version }) => ({ id, version }));
        try {
          await admin.request('/review-queue/decide', 'POST', {
            kind: this.data.reviewKind,
            action: e.currentTarget.dataset.action,
            note: '',
            items,
          });
          await this.load();
        } catch (e) {
          api.message(e);
        }
      },
      more() {
        if (this.data.next || this.data.hasMore) this.load(true);
      },
      async logout() {
        try {
          await admin.request('/auth/logout', 'POST', {});
        } catch (_) {}
        admin.clearSession();
        wx.redirectTo({ url: '/pages/admin/index' });
      },
      replay() {
        this.selectComponent('#experience')?.replay();
      },
      async runtime() {
        try {
          const r = await admin.request('/metrics');
          this.setData({ readBody: JSON.stringify(r, null, 2) });
        } catch (e) {
          api.message(e);
        }
      },
      async contact(e) {
        getApp().globalData.contactUser = e.currentTarget.dataset.id;
        getApp().globalData.nativeAdminTab = 'messages';
        wx.navigateTo({ url: '/pages/admin/index?tab=messages' });
      },
    },
    { administrator: true },
  ),
);
