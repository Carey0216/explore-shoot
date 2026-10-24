const api = require('../../services/api'),
  appearance = require('../../services/appearance');
const names = {
  detail: 'place',
  my: 'me',
  assistant: 'support',
  admin: 'overview',
  'admin-console': 'overview',
  scout: 'publish',
  share: 'place',
  guides: 'guides',
  comparison: 'place',
  journey: 'journey',
  notes: 'notes',
  framing: 'place',
};
const userTour = [
  [
    'discover',
    '发现你的校园',
    '先看照片和一句拍摄建议，再进入地点详情。发现与机位在顶部居中切换，主图下面还有更多内容。',
  ],
  ['camera', '一站一张新发现', '地点中可以收藏、导航、拍照打卡，私人照片默认仅自己可见。'],
  [
    'calendar',
    '参加活动，点亮印章',
    '活动详情展示真实进度和下一站；灰色印章未获得，印章只按真实打卡解锁。',
  ],
  ['camera', '把想拍的安排进清单', '指南、探索路线、出发清单和导航帮助你从想法走到现场。'],
  ['shield', '你的校园护照', '查看成就和建筑进度，分享带二维码的公开卡片。'],
  [
    'user',
    '我的工具和偏好',
    '我的先展示护照与最近探索，再是常用工具；更多工具与帮助可以重新打开引导。深色默认跟随系统。',
  ],
  ['message', '随时问问校园助手', '基础问题先用公开预设，必要时再由配置的模型继续回答。'],
  ['check', '准备一起共创了吗', '完成5题规范小测可成为探索官，发布内容仍需审核。'],
];
Component(
  require('../../services/localization').component({
    properties: {
      suspended: Boolean,
      features: Object,
      page: String,
      account: Object,
      administrator: Boolean,
      theme: String,
      styles: String,
      avatar: { type: String, value: 'orbit' },
    },
    data: {
      open: false,
      keyboardHeight: 0,
      chatHeight: 0,
      loading: false,
      input: '',
      turns: [],
      caps: { presets: [] },
      error: '',
      supportVisible: require('../../services/features').visible('support'),
      tour: null,
      tourIndex: 0,
      tourTotal: 0,
      hint: null,
      confetti: false,
      unreadUpdate: null,
    },
    lifetimes: {
      attached() {
        this.visible = true;
        this.enter();
      },
      detached() {
        this.visible = false;
        this.serial = (this.serial || 0) + 1;
        clearTimeout(this.hintTimer);
        this.stopCanvas?.();
      },
    },
    pageLifetimes: {
      show() {
        this.visible = true;
        this.enter();
      },
      hide() {
        this.visible = false;
        this.serial = (this.serial || 0) + 1;
        this.stopCanvas?.();
        this.setData({ open: false, tour: null, hint: null, loading: false });
        clearTimeout(this.hintTimer);
      },
    },
    observers: {
      features: function () {
        const visible = require('../../services/features').visible('support');
        this.setData({ supportVisible: visible, ...(!visible ? { open: false } : {}) });
      },
      'open,tour,unreadUpdate': function (open, tour, update) {
        this.triggerEvent('overlay', { open: !!(open || tour || update) });
      },
      'account.id,page': function () {
        if (this.visible) this.enter();
      },
    },
    methods: {
      noop() {},
      client() {
        return this.data.administrator ? require('../../services/admin-api') : api;
      },
      owner() {
        return this.client().session()?.account?.id || 'guest';
      },
      storageKey() {
        return (
          'campus-native-chat:' +
          require('../../services/network').configuredOrigin() +
          ':' +
          (this.data.administrator ? 'admin:' : 'user:') +
          this.owner()
        );
      },
      async enter() {
        if (!this.data.page || (this.data.administrator && !this.client().session())) return;
        this.setData({ supportVisible: require('../../services/features').visible('support') });
        const key = this.storageKey();
        if (this.chatKey !== key) {
          this.chatKey = key;
          this.serial = (this.serial || 0) + 1;
          const saved = wx.getStorageSync(key) || {};
          this.setData({
            open: false,
            turns: (saved.turns || []).slice(-40),
            input: saved.input || '',
            loading: false,
            error: '',
          });
        }
        const scope = this.owner(),
          page = this.data.page;
        if (!this.data.administrator)
          api
            .cached('/api/assistant/capabilities')
            .then((caps) => {
              if (this.visible && this.owner() === scope) this.setData({ caps });
            })
            .catch(() => {});
        const tourKey =
          'campus-native-tour:' +
          require('../../services/network').configuredOrigin() +
          ':' +
          (this.data.administrator ? 'admin:' : 'user:') +
          scope;
        this.tourKey = tourKey;
        if (!wx.getStorageSync(tourKey) && !this.data.tour) {
          this.tourKey = tourKey;
          this.startTour();
        } else if (!this.data.tour) {
          const endpoint = this.data.administrator ? '/updates' : '/api/updates';
          this.client()
            .request(endpoint)
            .then((r) => {
              if (!this.visible || this.owner() !== scope || this.data.page !== page) return;
              const latest = r.published && r.version ? r : (r.items || [])[0];
              if (latest?.version && wx.getStorageSync(tourKey + ':version') !== latest.version)
                this.setData({ unreadUpdate: latest });
            })
            .catch(() => {});
        }
        const pending = getApp().globalData.pendingNativeEvent;
        if (
          !this.data.administrator &&
          pending?.owner === this.owner() &&
          pending.origin === require('../../services/network').configuredOrigin()
        ) {
          getApp().globalData.pendingNativeEvent = null;
          void this.celebrate(pending.event);
        }
        void this.celebrate('page-enter');
      },
      startTour() {
        this.setData({ activitySpotlight: '' });
        this.tour = this.data.administrator
          ? [
              ['discover', '管理工作台', '从待办与审核开始，功能按本账号授权展示。'],
              [
                'user',
                '用户与权限',
                '管理身份、探索官申请、规范题库与私信；实际身份变更恢复5次答题机会。',
              ],
              ['camera', '内容维护', '地点、机位、指南、路线、作品、护照和活动在对应栏目维护。'],
              ['message', '更新与运营', '更新说明先自动生成草稿，由顶管检查并分别发布给双端。'],
              [
                'settings',
                '保护配置与私有数据',
                '敏感设置需要再次验证，普通管理员不能读密钥或浏览热度。',
              ],
            ]
          : userTour;
        this.setData({ tour: this.tour[0], tourIndex: 0, tourTotal: this.tour.length });
      },
      nextTour() {
        const i = this.data.tourIndex + 1;
        if (i >= this.tour.length) return this.closeTour();
        this.setData({ tour: this.tour[i], tourIndex: i });
      },
      prevTour() {
        const i = Math.max(0, this.data.tourIndex - 1);
        this.setData({ tour: this.tour[i], tourIndex: i });
      },
      activityGuide(topic, rect) {
        this.setData({
          activitySpotlight: rect
            ? 'left:' +
              (rect.left - 6) +
              'px;top:' +
              (rect.top - 6) +
              'px;width:' +
              (rect.width + 12) +
              'px;height:' +
              (rect.height + 12) +
              'px'
            : '',
        });
        this.activityTopic = topic;
        this.tour = [
          [
            'camera',
            '在这一站，留下真实打卡',
            '你正在参加「' +
              topic.title +
              '」。在活动有效时间内完成真实打卡，查看地点或完成计划不会点亮印章。',
          ],
        ];
        this.setData({ tour: this.tour[0], tourIndex: 0, tourTotal: 1 });
      },
      closeTour() {
        if (this.activityTopic) {
          const t = this.activityTopic;
          this.activityTopic = null;
          this.setData({ tour: null, activitySpotlight: '' });
          this.hint(t);
          return;
        }
        if (this.tourKey) wx.setStorageSync(this.tourKey, true);
        this.setData({ tour: null });
        this.triggerEvent('tourdone');
      },
      replay() {
        this.startTour();
      },
      updateClose() {
        const u = this.data.unreadUpdate;
        if (u?.version)
          wx.setStorageSync(
            (this.tourKey ||
              'campus-native-tour:' +
                require('../../services/network').configuredOrigin() +
                ':user:' +
                this.owner()) + ':version',
            u.version,
          );
        this.setData({ unreadUpdate: null });
      },
      updateOpen() {
        this.updateClose();
        require('../../services/links').open('#updates');
      },
      toggle() {
        if (!this.data.open && !require('../../services/features').allow('support')) return;
        this.setData({ open: !this.data.open, error: '' });
      },
      close() {
        this.setData({ open: false, keyboardHeight: 0 });
        wx.hideKeyboard?.();
      },
      keyboard(e) {
        const height = Math.max(0, e.detail.height || 0);
        const windowHeight = wx.getWindowInfo
          ? wx.getWindowInfo().windowHeight
          : wx.getSystemInfoSync().windowHeight;
        this.setData({
          keyboardHeight: height,
          chatHeight: Math.max(160, windowHeight - height - 12),
        });
      },
      updateScroll(e) {
        this.setData({ updateAtEnd: e.detail.scrollTop > 25 });
      },
      input(e) {
        this.setData({ input: e.detail.value });
        this.persist();
      },
      persist() {
        wx.setStorageSync(this.storageKey(), {
          turns: this.data.turns.slice(-40).map(({ chunks, ...turn }) => turn),
          input: this.data.input,
        });
      },
      clear() {
        this.serial = (this.serial || 0) + 1;
        this.setData({ turns: [], input: '', loading: false, error: '' });
        this.persist();
      },
      preset(e) {
        this.setData({ input: e.currentTarget.dataset.question });
        this.send();
      },
      further() {
        this.send(true);
      },
      async send(further = false) {
        if (!require('../../services/features').allow('support')) return;
        if (typeof further !== 'boolean') further = false;
        if (this.data.loading) return;
        const question = further ? this.lastQuestion : this.data.input.trim();
        if (!question) return;
        const started = Date.now();
        const stamp = (this.serial = (this.serial || 0) + 1),
          owner = this.owner(),
          history = this.data.turns.slice(-8).map(({ role, content }) => ({ role, content }));
        this.lastQuestion = question;
        const turns = further
          ? this.data.turns
          : [...this.data.turns, { role: 'user', content: question }];
        this.setData({ turns, input: '', loading: true, error: '' });
        this.persist();
        try {
          const r = await api.request('/api/assistant/chat', 'POST', {
            question,
            history,
            purpose: 'support',
            generate: true,
            further,
          });
          const [displayAnswer] = await require('../../services/localization').translate(
            [r.answer || ''],
            this.data.administrator,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, 1250 - (Date.now() - started))),
          );
          if (!this.visible || stamp !== this.serial || owner !== this.owner()) return;
          const letters = Array.from(displayAnswer),
            size = Math.max(1, Math.ceil(letters.length / 160));
          const chunks = appearance.snapshot().reducedMotion
            ? null
            : Array.from({ length: Math.ceil(letters.length / size) }, (_, i) => ({
                text: letters.slice(i * size, (i + 1) * size).join(''),
                delay: Math.min(i * 24, 1800),
              }));
          this.setData({
            turns: [
              ...turns,
              {
                role: 'assistant',
                content: r.answer,
                chunks,
                mode: r.mode,
                links: [
                  ...(r.places || []).map((p) => ({ title: p.name, path: '#place/' + p.id })),
                  ...(r.sources || []).filter((s) => s.path),
                ].slice(0, 6),
              },
            ],
            furtherVisible: this.data.caps.furtherEnabled && r.mode !== 'generated',
          });
          this.persist();
          if (chunks)
            await new Promise((resolve) =>
              setTimeout(resolve, (chunks[chunks.length - 1]?.delay || 0) + 350),
            );
          if (this.visible && stamp === this.serial && owner === this.owner())
            this.setData({
              turns: this.data.turns.map((t) => {
                const { chunks, ...plain } = t;
                return plain;
              }),
            });
        } catch (e) {
          if (stamp === this.serial) {
            this.setData({ error: e.message, input: question });
            this.persist();
          }
        } finally {
          if (stamp === this.serial) this.setData({ loading: false });
        }
      },
      link(e) {
        require('../../services/links').open(e.currentTarget.dataset.path);
      },
      plan() {
        if (!require('../../services/features').allow('exploration')) return;
        this.close();
        wx.navigateTo({ url: '/pages/guides/index?compose=1' });
      },
      hint(topic) {
        clearTimeout(this.hintTimer);
        const stamp = (topic.stamps || []).find((s) => !s.earned) || topic.stamps?.[0];
        this.setData({
          hint: {
            title: topic.phase === 'active' ? '完成活动条件，也许可以获得' : '请留意活动有效时间',
            text: stamp?.title || topic.title,
            badge: stamp
              ? api.asset('/shared/badges/' + (stamp.badgePreset || 'badge-01') + '.png', false)
              : '',
            earned: !!stamp?.earned,
          },
        });
        this.hintTimer = setTimeout(() => this.closeHint(), 6000);
      },
      closeHint() {
        clearTimeout(this.hintTimer);
        this.setData({ hint: null });
      },
      async celebrate(event) {
        if (appearance.snapshot().reducedMotion) return;
        const owner = this.owner(),
          page = names[this.data.page] || this.data.page;
        try {
          const r = await this.client().request(
            this.data.administrator ? '/celebrations/claim' : '/api/celebrations/claim',
            'POST',
            { event, page },
          );
          if (!this.visible || this.owner() !== owner) return;
          const effect = r.items?.[0];
          if (!effect) return;
          const key = 'native-celebration:' + owner + ':' + effect.token;
          if (wx.getStorageSync(key)) return;
          wx.setStorageSync(key, true);
          this.play(effect);
        } catch (_) {}
      },
      play({ duration = 2800, density = 72 } = {}) {
        if (appearance.snapshot().reducedMotion) return;
        this.stopCanvas?.();
        this.setData({ confetti: true }, () => {
          this.createSelectorQuery()
            .select('#celebration')
            .fields({ node: true, size: true })
            .exec((r) => {
              const found = r?.[0];
              if (!found?.node) return;
              const canvas = found.node,
                ctx = canvas.getContext('2d'),
                w = found.width,
                h = found.height;
              canvas.width = w;
              canvas.height = h;
              const colors = ['#81baf0', '#f49db5', '#a6d3b2', '#f5ce79', '#c6aff0'],
                parts = Array.from({ length: Math.min(100, density) }, (_, i) => ({
                  x: w * (i % 2 ? 0.18 : 0.82),
                  vx: (Math.random() - 0.5) * w * 0.9,
                  vy: -h * (0.45 + Math.random() * 0.5),
                  size: 5 + Math.random() * 5,
                  c: colors[i % 5],
                }));
              let frame,
                started = Date.now();
              const stop = () => {
                canvas.cancelAnimationFrame(frame);
                this.setData({ confetti: false });
              };
              this.stopCanvas = stop;
              const draw = () => {
                const ms = Date.now() - started,
                  t = ms / 1000;
                if (!this.visible || ms > duration) return stop();
                ctx.clearRect(0, 0, w, h);
                ctx.globalAlpha = Math.min(1, (duration - ms) / 450);
                parts.forEach((p) => {
                  ctx.fillStyle = p.c;
                  ctx.fillRect(
                    p.x + p.vx * t,
                    h * 0.64 + p.vy * t + h * 0.3 * t * t,
                    p.size,
                    p.size * 0.6,
                  );
                });
                frame = canvas.requestAnimationFrame(draw);
              };
              draw();
            });
        });
      },
    },
  }),
);
