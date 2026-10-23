// Explicit UI schemas only: no arbitrary endpoint, JSON, database or file editor.
const F = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const B = (k, l, d = false) => F(k, l, 'bool', { default: d });
const N = (k, l, d = 0, min, max) => F(k, l, 'number', { default: d, min, max });
const P = (k, l, values, d) =>
  F(k, l, 'pick', {
    options: Object.entries(values).map(([id, label]) => ({ id, label })),
    default: d ?? Object.keys(values)[0],
  });
const R = (k, l, schema, max = 30) => F(k, l, 'rows', { schema, max });
const group = [
  {
    id: 'overview',
    title: '工作台',
    icon: 'compass',
    pages: ['overview', 'inbox', 'review-queue', 'updates'],
  },
  {
    id: 'users',
    title: '用户权限',
    icon: 'people',
    pages: ['users', 'applications', 'scout-quiz', 'messages'],
  },
  {
    id: 'points',
    title: '内容维护',
    icon: 'pin',
    pages: [
      'points',
      'shooting-spots',
      'works',
      'work-reports',
      'reports',
      'guides',
      'topics',
      'routes',
      'templates',
      'passport',
      'buildings',
      'campus-map',
      'map-models',
      'site-content',
      'announcements',
      'knowledge',
    ],
  },
  { id: 'audit', title: '记录', icon: 'clock', pages: ['audit'] },
  {
    id: 'settings',
    title: '账户设置',
    icon: 'settings',
    pages: [
      'settings',
      'admins',
      'features',
      'ai-settings',
      'support-settings',
      'celebrations',
      'map-config',
    ],
  },
];
const titles = {
  overview: '校园探索工作台',
  inbox: '消息与待办',
  'review-queue': '审核队列',
  updates: '更新与操作引导',
  users: '用户账号',
  applications: '探索官申请',
  'scout-quiz': '社区规范题库',
  messages: '用户联系与私信',
  points: '校园点位',
  'shooting-spots': '真实机位',
  works: '打卡作品审核',
  'work-reports': '作品举报',
  reports: '点位反馈',
  guides: '拍摄指南',
  topics: '活动专题',
  routes: '路线校准',
  templates: '拍摄任务',
  passport: '主题印章',
  buildings: '逐栋楼宇关联',
  'campus-map': '校园地点核验',
  'map-models': '模型配准与发布',
  'site-content': '站点文案',
  announcements: '开屏公告',
  knowledge: '校园知识库',
  audit: '操作记录',
  settings: '账户与外观',
  admins: '管理员账号',
  features: '交互功能与入口',
  'ai-settings': '模型与AI配置',
  'support-settings': '客服预设',
  celebrations: '彩纸与互动庆祝',
  'map-config': '地图SDK配置',
};
const feature = (name) =>
  ({
    guides: 'content',
    routes: 'content',
    templates: 'content',
    buildings: 'passport',
    'map-models': 'campus-map',
    admins: 'administrators',
    'support-settings': 'ai-settings',
    celebrations: 'features',
  })[name] || name;
function can(account, name, mode = 'read') {
  if (name === 'owner-account') return account?.role === 'owner';
  if (name === 'permissions') return account?.role === 'owner';
  if (name === 'updates' && mode === 'write') return account?.role === 'owner';
  if (['settings', 'inbox', 'updates', 'overview'].includes(name)) return !!account;
  if (
    [
      'admins',
      'features',
      'ai-settings',
      'support-settings',
      'celebrations',
      'map-config',
    ].includes(name) &&
    account?.role !== 'owner'
  )
    return false;
  if (name === 'review-queue')
    return ['applications', 'reports', 'works', 'work-reports', 'shooting-spots'].some((k) =>
      can(account, k, mode),
    );
  return account?.effectivePermissions?.includes(feature(name) + '.' + mode) || false;
}
function menu(account) {
  return group
    .map((g) => ({
      ...g,
      entries: g.pages.filter((n) => can(account, n)).map((id) => ({ id, title: titles[id] })),
    }))
    .filter((g) => g.entries.length);
}
const dataKeys = {
  users: 'users',
  applications: 'applications',
  points: 'points',
  'shooting-spots': 'shootingSpots',
  works: 'works',
  'work-reports': 'workReports',
  reports: 'reports',
  routes: 'routes',
  templates: 'templates',
  admins: 'admins',
};
const dynamic = new Set([
  'guides',
  'topics',
  'passport',
  'buildings',
  'campus-map',
  'knowledge',
  'announcements',
  'updates',
  'features',
  'scout-quiz',
  'site-content',
  'ai-settings',
  'support-settings',
  'celebrations',
  'audit',
  'review-queue',
  'map-config',
]);
function source(name) {
  if (name === 'map-models') return '/campus-map/map-models';
  if (name === 'buildings' || name === 'passport') return '/passport';
  if (name === 'audit') return '/records?kind=audit&category=all&role=all';
  if (name === 'map-config') return null;
  return dynamic.has(name) ? '/' + name : null;
}
function rows(name, data, overview) {
  if (dataKeys[name]) return overview[dataKeys[name]] || [];
  if (name === 'passport') return data.themes || [];
  if (name === 'buildings') return data.atlas?.buildings || [];
  if (name === 'campus-map') return data.places || [];
  if (name === 'map-models') return data.models || [];
  if (name === 'audit') return data.events || [];
  if (name === 'updates') return data.pending || [];
  if (name === 'review-queue') return data.items || [];
  if (
    [
      'features',
      'scout-quiz',
      'site-content',
      'ai-settings',
      'support-settings',
      'celebrations',
    ].includes(name)
  )
    return [{ id: 'configuration', title: titles[name] }];
  return data?.items || [];
}
const overviewFields = ['summary', 'version'];
function options(rows, label = 'name') {
  return rows.map((r) => ({ id: r.id, label: r[label] || r.title || r.id }));
}
function schema(name, old = {}, context = {}) {
  const points = options(context.overview?.points || []),
    rules = options(context.rules || [], 'title'),
    conditions = ['night', 'portrait', 'architecture', 'rain', 'solo'].map((id, i) => ({
      id,
      label: ['夜景', '人像', '建筑', '雨天', '独自拍'][i],
    }));
  const multi = (k, l, opts) => F(k, l, 'multi', { options: opts });
  const text = (k, l, e = {}) => F(k, l, 'text', e),
    area = (k, l, e = {}) => F(k, l, 'multiline', e);
  const metadata = () =>
    old.id && old.id !== 'configuration' ? { revision: old.revision || 0 } : {};
  let fields = [],
    initial = old,
    endpoint = '/' + name + (old.id && old.id !== 'configuration' ? '/' + old.id : ''),
    method = old.id ? 'PATCH' : 'POST',
    kind = 'plain',
    base = metadata(),
    hint = '修改后由服务器重新校验权限和修订，保存成功才生效。',
    actions = ['save'];
  switch (name) {
    case 'users':
      fields = [
        text('username', '登录账号', { required: true }),
        text('nickname', '昵称', { required: true }),
        P(
          'scoutStatus',
          '探索官身份',
          { none: '普通用户', approved: '校园探索官' },
          old.scoutStatus === 'approved' ? 'approved' : 'none',
        ),
        B('enabled', '账号正常使用', true),
        F('password', '重置密码（留空保持）', 'password', { omitEmpty: true }),
        B('confirmed', '我已确认修改对象与登录失效影响'),
      ];
      hint =
        '身份实际变更后恢复5次答题机会，旧答卷失效；修改资料或密码会撤销现有登录。停用账号仍不能答题。';
      break;
    case 'admins':
      fields = [
        ...(old.id ? [] : [text('username', '管理员账号', { required: true })]),
        text('name', '显示名称', { required: true }),
        P(
          'role',
          '管理员角色',
          { normal: '普通管理员', super: '超级管理员' },
          old.role || 'normal',
        ),
        F('password', old.id ? '重置密码（留空保持）' : '初始密码', 'password', {
          required: !old.id,
          omitEmpty: !!old.id,
        }),
        ...(old.id ? [B('enabled', '正常使用', true)] : []),
      ];
      base = {};
      break;
    case 'permissions':
      endpoint = '/admins/' + old.id;
      method = 'PATCH';
      base = { permissionRevision: old.permissionRevision || 0 };
      fields = Object.entries(context.permissions?.features || {})
        .filter(
          ([key]) => !['administrators', 'features', 'ai-settings', 'map-config'].includes(key),
        )
        .flatMap(([key, label]) =>
          ['read', 'write'].map((mode) =>
            P(
              key + '.' + mode,
              label + ' · ' + (mode === 'read' ? '查看' : '修改'),
              { inherit: '沿用角色', allow: '允许', deny: '禁止' },
              old.permissionOverrides?.[key + '.' + mode] === true
                ? 'allow'
                : old.permissionOverrides?.[key + '.' + mode] === false
                  ? 'deny'
                  : 'inherit',
            ),
          ),
        );
      initial = {};
      kind = 'permissions';
      break;
    case 'applications':
      fields = [
        P('status', '审核结果', { approved: '通过并开放发布', rejected: '暂不通过' }, 'approved'),
        area('note', '审核意见'),
      ];
      base = {};
      break;
    case 'points':
      fields = [
        text('name', '地点名称', { required: true }),
        area('description', '地点介绍'),
        area('condition', '拍摄与通行条件'),
        text('source', '资料来源'),
        N('lng', '经度', 106.1),
        N('lat', '纬度', 38.496),
        P(
          'theme',
          '主题',
          { 建筑: '建筑', 自然: '自然', 人文: '人文', 运动: '运动' },
          old.theme || '建筑',
        ),
        P(
          'display',
          '展示状态',
          { online: '上线并开放', closed: '展示但暂停打卡', offline: '下线' },
          old.published ? (old.open ? 'online' : 'closed') : 'offline',
        ),
        B('certify', '已按现场资料核实'),
      ];
      base = {};
      kind = 'point';
      method = 'PATCH';
      break;
    case 'shooting-spots':
      fields = [
        F('pointId', '关联地点', 'pick', {
          options: points,
          default: old.pointId || points[0]?.id,
        }),
        text('title', '机位名称', { required: true }),
        area('standDescription', '真实站位描述', { required: true }),
        N('lng', '经度', 106.1),
        N('lat', '纬度', 38.496),
        N('bearing', '拍摄朝向（度）', 0, 0, 359),
        F('heightMeters', '建议镜头离地高度', 'number', { nullable: true, min: 0, max: 100 }),
        text('heightAdvice', '高度建议'),
        text('bestTime', '适合时间'),
        area('compositionTip', '构图建议'),
        text('verifiedAt', '核验日期（YYYY-MM-DD）'),
        area('openingWindows', '每行开放时段，例如 1,2,3 08:00-18:00'),
        multi('conditions', '拍摄条件', conditions),
        text('openingHours', '开放时间说明'),
        P(
          'availability',
          '开放状态',
          { unknown: '待确认', open: '开放', limited: '有限开放', closed: '暂时关闭' },
          old.availability || 'unknown',
        ),
        area('accessNotice', '施工与入口变化提醒'),
        F('exampleMediaId', '有权公开的机位示例照片', 'image'),
        P(
          'status',
          '展示状态',
          { draft: '草稿', pending: '待核验', published: '发布', rejected: '不通过' },
          old.status || 'draft',
        ),
      ];
      initial = {
        ...old,
        openingWindows: (old.openingWindows || [])
          .map((w) => w.days.join(',') + ' ' + w.start + '-' + w.end)
          .join('\n'),
      };
      kind = 'spot';
      break;
    case 'works':
      fields = [
        P(
          'status',
          '审核结果',
          { approved: '批准公开', rejected: '不通过', hidden: '隐藏' },
          old.status === 'approved' ? 'approved' : 'rejected',
        ),
        area('note', '审核意见'),
      ];
      break;
    case 'work-reports':
      fields = [
        P(
          'action',
          '处理方式',
          { hide: '隐藏作品并处理', resolve: '已处理并保留作品', reject: '暂不采纳' },
          'resolve',
        ),
        area('note', '处理说明'),
      ];
      base = {};
      break;
    case 'reports':
      fields = [
        P(
          'action',
          '处理方式',
          {
            resolve: '已核实处理，保持展示',
            offline: '下线点位',
            online: '重新上线',
            reject: '暂不采纳',
          },
          'resolve',
        ),
        area('note', '处理说明'),
      ];
      base = {};
      break;
    case 'guides':
      fields = [
        text('title', '指南标题', { required: true }),
        area('description', '介绍', { required: true }),
        P(
          'scene',
          '适用场景',
          { newcomer: '新生入门', break: '课间', evening: '饭后', weekend: '周末' },
          old.scene || 'newcomer',
        ),
        N('minutes', '建议分钟', 20, 5, 180),
        multi('pointIds', '关联地点', points),
        F('steps', '拍摄步骤（每行一条）', 'lines', { required: true }),
        B('published', '发布给用户'),
      ];
      method = old.id ? 'PUT' : 'POST';
      break;
    case 'routes':
      fields = [
        N('walk', '计划步行分钟', old.walk || 10, 1, 60),
        F('timing', '补充一次实走分钟', 'number', { omitEmpty: true, min: 1, max: 60 }),
        B('active', '路线可用', old.active !== false),
      ];
      base = {};
      break;
    case 'templates':
      fields = [
        text('title', '任务标题', { required: true }),
        F('steps', '任务步骤（每行一条）', 'lines', { required: true }),
        B('approved', '审核通过可使用'),
      ];
      base = {};
      break;
    case 'passport':
      endpoint = '/passport/themes' + (old.id ? '/' + old.id : '');
      fields = [
        text('title', '印章标题', { required: true }),
        area('description', '说明'),
        P(
          'kind',
          '获得条件',
          { visits: '打卡次数', night: '夜间打卡', photos: '照片打卡', collection: '集齐指定地点' },
          old.kind || 'visits',
        ),
        text('symbol', '图标标识', { default: 'camera' }),
        F('badgePreset', '印章图案', 'pick', {
          options: Array.from({ length: 50 }, (_, i) => ({
            id: 'badge-' + String(i + 1).padStart(2, '0'),
            label: '印章 ' + (i + 1),
          })),
          default: old.badgePreset || 'badge-01',
        }),
        N('target', '目标数量', 1, 1, 10000),
        multi('pointIds', '关联地点', points),
        B('published', '公开展示'),
      ];
      break;
    case 'buildings':
      endpoint = '/passport/buildings';
      method = 'PUT';
      base = { id: old.id, revision: old.revision || 0 };
      fields = [
        text('name', '楼宇名称', { required: true }),
        multi('pointIds', '已核实关联地点', points),
      ];
      break;
    case 'topics':
      fields = [
        text('title', '活动标题', { required: true }),
        area('description', '活动介绍'),
        P(
          'theme',
          '活动主题',
          {
            spring: '春日校园',
            graduation: '毕业季',
            autumn: '秋色',
            night: '夜景',
            other: '校园活动',
          },
          old.theme || 'other',
        ),
        text('startsAt', '开始时间（ISO日期，含时区）', {
          required: true,
          placeholder: '2026-10-22T08:00:00+08:00',
        }),
        text('endsAt', '结束时间（ISO日期，含时区）', { required: true }),
        multi('pointIds', '关联地点', points),
        multi('ruleIds', '关联主题印章', rules),
        B('published', '发布活动'),
      ];
      method = old.id ? 'PUT' : 'POST';
      break;
    case 'campus-map':
      endpoint = '/campus-map/places' + (old.id ? '/' + old.id : '');
      fields = [
        text('name', '地点名称', { required: true }),
        text('aliases', '别名'),
        text('category', '地点分类'),
        P('zone', '校区', { 东校区: '东校区', 西校区: '西校区' }, old.zone || '东校区'),
        N('lng', '经度', 106.1),
        N('lat', '纬度', 38.496),
        area('description', '地点说明'),
        text('source', '资料来源'),
        B('confirmed', '已核实实际位置'),
        B('published', '发布给用户'),
      ];
      break;
    case 'map-models':
      endpoint = '/campus-map/map-models/clock';
      method = 'PATCH';
      fields = [
        N('lng', '经度', 106.1041968),
        N('lat', '纬度', 38.4962936),
        N('heading', '朝向（度）', 0, -360, 360),
        N('scale', '比例', 0.7, 0.1, 2),
        N('altitude', '离地高度（米）', 0, -20, 30),
        text('source', '实景核对依据', { required: true }),
        B('confirmed', '已核对位置、比例和朝向'),
        B('published', '发布配准模型'),
      ];
      kind = 'map-model';
      actions = ['save', 'unpublish'];
      hint = '配准草稿与线上快照分开保存；确认后发布，停止投放后恢复底图建筑。';
      break;
    case 'knowledge':
      fields = [
        text('title', '资料标题', { required: true }),
        area('body', '公开知识正文', { required: true }),
        F('tags', '检索标签（逗号分隔）', 'tags'),
        multi('pointIds', '相关地点', points),
        text('sourceUrl', '公开来源HTTPS链接'),
      ];
      initial = old.draft || old;
      kind = 'content';
      method = old.id ? 'PUT' : 'POST';
      actions = ['draft', 'preview', 'publish', 'unpublish'];
      break;
    case 'site-content':
      fields = [
        text('siteName', '项目名称', { required: true }),
        text('campusName', '校园名称', { required: true }),
        area('notice', '页面公告条'),
        area('about', '项目介绍'),
        area('help', '帮助说明'),
        area('shootingGuide', '拍摄与通行建议'),
        R('categories', '机位分类', [
          F('id', '固定分类标识', 'readonly'),
          text('label', '名称', { required: true }),
          area('description', '说明'),
        ]),
        R('conditions', '拍摄条件', [
          F('id', '固定条件标识', 'readonly'),
          text('label', '名称', { required: true }),
          area('description', '说明'),
        ]),
      ];
      initial = context.data.draft || {};
      endpoint = '/site-content';
      method = 'PUT';
      base = { revision: context.data.revision };
      kind = 'content';
      actions = ['draft', 'preview', 'publish', 'unpublish'];
      break;
    case 'announcements':
      fields = [
        text('title', '标题', { required: true }),
        area('body', '正文', { required: true }),
        multi('channels', '展示客户端', [
          { id: 'web', label: '网页' },
          { id: 'mini', label: '微信小程序' },
        ]),
        F('pages', '适用页面（留空全部，编号每行一个）', 'lines'),
        P(
          'audience',
          '投放对象',
          {
            all: '全部用户',
            members: '已登录用户',
            scouts: '校园探索官',
            ordinary: '普通用户',
            guest: '游客',
            selected: '指定用户',
          },
          'all',
        ),
        F('userIds', '指定用户ID（每行一个）', 'lines'),
        text('startsAt', '开始时间（留空立即）'),
        text('endsAt', '结束时间（留空不限）'),
        N('maxTotal', '每人总次数（0不限）', 1),
        N('maxDaily', '每日次数（0不限）', 1),
        N('intervalMinutes', '间隔分钟', 0),
        N('priority', '优先级', 0),
        F('imageId', '有权公开的公告配图', 'image'),
        R(
          'links',
          '相关入口',
          [text('label', '入口名称'), text('href', '站内#路由或HTTPS链接')],
          6,
        ),
        multi('delivery', '送达方式', [
          { id: 'popup', label: '开屏弹出' },
          { id: 'inbox', label: '消息中心' },
        ]),
        ...(old.releaseVersion
          ? [area('adminBody', '管理端更新说明（顶管检查）', { required: true })]
          : []),
      ];
      initial = {
        channels: ['web', 'mini'],
        pages: [],
        audience: 'all',
        delivery: ['popup', 'inbox'],
        ...(old.draft || {}),
        ...(old.releaseVersion ? { channels: ['web', 'mini'] } : {}),
        adminBody: old.adminDraft || '',
      };
      kind = 'announcement';
      method = old.id ? 'PUT' : 'POST';
      actions = ['draft', 'preview', 'publish', 'unpublish'];
      break;
    case 'scout-quiz':
      fields = [
        R(
          'questions',
          '规范题目',
          [
            F('id', '题目编号', 'readonly', { default: 'uuid' }),
            text('title', '题目', { required: true }),
            F('options', '选项（每行一个，2至5项）', 'lines', { required: true }),
            N('answer', '正确选项编号（从0开始）', 0, 0, 4),
          ],
          100,
        ),
      ];
      initial = context.data;
      endpoint = '/scout-quiz';
      method = 'PUT';
      base = { revision: context.data.revision };
      break;
    case 'features':
      fields = Object.entries(context.data.labels || {}).flatMap(([key, label]) => [
        B(key + ':enabled', label + ' · 开放功能', context.data.features[key].enabled),
        B(key + ':visible', label + ' · 显示入口', context.data.features[key].visible),
      ]);
      initial = {};
      endpoint = '/features';
      method = 'PUT';
      base = { revision: context.data.revision };
      kind = 'features';
      break;
    case 'ai-settings':
      fields = [
        text('base', '接口基础地址'),
        text('model', '模型名称'),
        F(
          'key',
          context.data.keyConfigured ? 'API Key 已配置（留空保持）' : 'API Key',
          'password',
          { omitEmpty: true },
        ),
        B('clearKey', '清除已保存密钥'),
        F('currentPassword', '当前顶级管理员密码', 'password', { required: true }),
      ];
      initial = context.data;
      endpoint = '/ai-settings';
      method = 'PUT';
      base = { revision: context.data.revision };
      hint = '密钥只保存在服务器受保护配置中，不回显，不保存在本机草稿。';
      break;
    case 'support-settings':
      fields = [
        B('furtherEnabled', '显示进一步回答按钮', context.data.furtherEnabled),
        text('modelLabel', '按钮中的模型称呼', { required: true }),
        R(
          'presets',
          '客服预设',
          [
            F('id', '预设编号', 'readonly', { default: 'uuid' }),
            text('title', '问题名称', { required: true }),
            F('keywords', '匹配关键词（逗号分隔）', 'tags', { required: true }),
            area('answer', '直接回复', { required: true }),
            text('path', '附带入口（#guides等，可留空）'),
          ],
          20,
        ),
      ];
      initial = context.data;
      endpoint = '/support-settings';
      method = 'PUT';
      base = { revision: context.data.revision };
      break;
    case 'celebrations':
      fields = [
        R(
          'rules',
          '彩纸规则',
          [
            F('id', '规则编号', 'readonly', { default: 'uuid' }),
            text('title', '规则名称', { required: true }),
            B('enabled', '启用规则'),
            P('event', '触发条件', {
              'page-enter': '进入页面 / 全局投放',
              'scout-passed': '通过探索官小测',
              'checkin-saved': '成功保存打卡',
            }),
            P('channel', '投放端', { user: '用户端', admin: '管理端', both: '双端' }),
            F('pages', '适用页面编号（留空全部，每行一个）', 'lines'),
            P('audience', '投放人群', {
              all: '全部访问者',
              'signed-in': '已登录账号',
              scouts: '校园探索官',
              standard: '普通用户',
              specific: '指定账号',
            }),
            F('usernames', '指定登录账号（逗号分隔）', 'tags'),
            text('startsAt', '开始时间（ISO，留空立即）'),
            text('endsAt', '结束时间（ISO，留空不限）'),
            N('duration', '持续毫秒', 2800, 1000, 5000),
            N('density', '彩纸数量', 72, 16, 100),
          ],
          24,
        ),
      ];
      initial = context.data;
      endpoint = '/celebrations';
      method = 'PUT';
      base = { revision: context.data.revision };
      hint = '只投放视觉庆祝，不直接发放积分或资格；减少动画时不播放。';
      break;
    case 'owner-account':
      fields = [
        text('username', '顶管登录账号', { required: true, default: context.account.username }),
        F('currentPassword', '当前密码', 'password', { required: true }),
        F('password', '新密码（留空不修改密码）', 'password'),
      ];
      endpoint = '/owner-account';
      method = 'PUT';
      base = {};
      hint = '修改后会撤销所有现有管理登录，需要重新登录。';
      break;
    case 'settings':
      fields = [
        text('nickname', '昵称'),
        F('currentPassword', '当前密码', 'password'),
        F('newPassword', '新密码', 'password', { omitEmpty: true }),
      ];
      initial = { nickname: context.account.nickname || context.account.name };
      endpoint = '/auth/profile';
      method = 'PATCH';
      base = {};
      kind = 'account';
      hint = '外观随本管理员账号同步，用户会话与管理会话保持隔离。';
      break;
    case 'map-config':
      fields = [
        text('username', '顶级管理员账号', { required: true }),
        F('password', '再次验证密码', 'password', { required: true }),
      ];
      initial = { username: context.account.username };
      endpoint = '/map-config/unlock';
      method = 'POST';
      base = {};
      kind = 'unlock';
      hint = '每次查看或修改SDK配置都需要再次验证；授权仅3分钟，离页清理。';
      break;
  }
  return {
    name,
    title: titles[name] || '单账号功能授权',
    fields,
    initial,
    endpoint,
    method,
    kind,
    base,
    hint,
    actions,
  };
}
function payload(config, value, action = 'save') {
  let out = { ...config.base, ...value };
  if (config.kind === 'permissions') {
    out = { ...config.base, permissionOverrides: {} };
    Object.entries(value).forEach(([k, v]) => {
      if (v !== 'inherit') out.permissionOverrides[k] = v === 'allow';
    });
  }
  if (config.kind === 'features') {
    out = { ...config.base, features: {} };
    Object.entries(value).forEach(([k, v]) => {
      const [id, mode] = k.split(':');
      out.features[id] ||= {};
      out.features[id][mode] = v;
    });
  }
  if (config.kind === 'content')
    out = { ...config.base, action: action === 'save' ? 'draft' : action, content: value };
  if (config.kind === 'announcement') {
    const { adminBody, ...content } = value;
    out = {
      ...config.base,
      action: action === 'save' ? 'draft' : action,
      content,
      ...(adminBody === undefined ? {} : { adminBody }),
    };
  }
  if (config.kind === 'point') {
    out = {
      ...out,
      allowed: out.condition,
      published: out.display !== 'offline',
      open: out.display === 'online',
    };
    delete out.display;
  }
  if (config.kind === 'spot')
    out.openingWindows = String(value.openingWindows || '').trim()
      ? String(value.openingWindows)
          .trim()
          .split('\n')
          .map((line) => {
            const m = /^([1-7](?:,[1-7])*)\s+([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)$/.exec(
              line.trim(),
            );
            if (!m) throw Error('开放时段格式：1,2,3 08:00-18:00');
            return { days: m[1].split(',').map(Number), start: m[2], end: m[3] };
          })
      : [];
  return out;
}
module.exports = {
  group,
  titles,
  menu,
  can,
  feature,
  source,
  rows,
  schema,
  payload,
  F,
  B,
  N,
  P,
  R,
};
