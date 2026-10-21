import { $, api, esc, errorHTML, formSubmit, toast, field } from '/shared/ui.js';
import { playCelebration } from '/shared/celebrations.js';
const events = {
  'page-enter': '进入页面 / 全局投放',
  'scout-passed': '通过探索官小测',
  'checkin-saved': '成功保存打卡',
};
const audiences = {
  all: '全部访问者（含访客）',
  'signed-in': '已登录账号',
  scouts: '校园探索官',
  standard: '普通用户',
  specific: '指定登录账号',
};
const channels = { user: '用户端', admin: '管理端', both: '用户端与管理端' };
const pages = {
  discover: '校园发现',
  place: '地点详情',
  spot: '机位详情',
  shooting: '机位与拍摄',
  checkin: '打卡',
  publish: '发布',
  passport: '护照',
  me: '我的',
  map: '出行地图',
  topics: '活动',
  guides: '拍摄指南',
  updates: '更新说明',
  notifications: '用户通知',
  settings: '账户设置',
  overview: '管理概览',
  inbox: '管理消息',
  users: '用户账号',
  applications: '探索官申请',
  'scout-quiz': '题库',
  messages: '管理私信',
  points: '点位维护',
  'shooting-spots': '机位维护',
  works: '作品审核',
  reports: '反馈',
  'review-queue': '审核队列',
  announcements: '公告',
  'site-content': '站点文案',
  knowledge: '知识库',
  features: '交互与彩纸',
  'ai-settings': '模型配置',
  admins: '管理员',
  audit: '记录',
  content: '内容',
  'campus-map': '校园地图',
  'work-reports': '作品举报',
  topic: '活动详情',
  guide: '指南详情',
  notice: '通知详情',
  contact: '联系管理员',
  conversation: '私信会话',
  search: '校园搜索',
  shots: '机位列表',
  shot: '拍摄建议',
  building: '建筑详情',
  'shared-plan': '分享计划',
  navigate: '步行导航',
  routes: '探索路线列表',
  route: '路线详情',
  explore: '探索任务',
  collections: '收藏分组',
  'my-works': '我的作品',
  notes: '私人手记',
  plans: '拍摄清单',
  active: '当前拍摄',
  journey: '行程',
};
const options = (items, value) =>
  Object.entries(items)
    .map(
      ([key, label]) =>
        `<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`,
    )
    .join('');
const local = (value) =>
  value
    ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
export async function mountCelebrationSettings(host) {
  const section = document.createElement('section');
  section.className = 'celebration-settings';
  host.append(section);
  try {
    const data = await api('/api/admin/celebrations');
    if (!section.isConnected) return;
    let rules = structuredClone(data.rules);
    const read = () => {
      const values = new FormData($('#celebration-form', section));
      return rules.map((r, i) => ({
        id: r.id,
        title: values.get(`title-${i}`),
        enabled: values.has(`enabled-${i}`),
        event: values.get(`event-${i}`),
        channel: values.get(`channel-${i}`),
        audience: values.get(`audience-${i}`),
        usernames: String(values.get(`usernames-${i}`) || '')
          .split(/[\s,，]+/)
          .filter(Boolean),
        pages: values.getAll(`pages-${i}`),
        startsAt: values.get(`start-${i}`) ? new Date(values.get(`start-${i}`)).toISOString() : '',
        endsAt: values.get(`end-${i}`) ? new Date(values.get(`end-${i}`)).toISOString() : '',
        duration: Number(values.get(`duration-${i}`)),
        density: Number(values.get(`density-${i}`)),
      }));
    };
    const draw = () => {
      section.innerHTML = `<h2>彩纸与互动庆祝</h2><p class="muted">仅顶级管理员可设置。选择时间、页面、触发条件和人群；规则更新后每个账号触发一次，未修改的规则不重复。访客在当前浏览器去重，减少动画模式不播放。这里只投放视觉效果，不授予资格、积分或奖励。</p><form id="celebration-form"><div class="celebration-rules">${rules
        .map(
          (r, i) =>
            `<fieldset class="celebration-rule"><legend>${esc(r.title)}</legend><label class="inline-check"><input type="checkbox" name="enabled-${i}" ${r.enabled ? 'checked' : ''}>启用这条规则</label>${field('规则名称', `title-${i}`, 'text', r.title, 'required maxlength="80"')}<div class="celebration-fields"><label>触发条件<select name="event-${i}">${options(events, r.event)}</select></label><label>投放端<select name="channel-${i}">${options(channels, r.channel)}</select></label><label>投放人群<select name="audience-${i}">${options(audiences, r.audience)}</select></label>${field('指定账号（仅指定人群时使用）', `usernames-${i}`, 'text', r.usernames.join(', '), 'maxlength="3300" placeholder="登录账号，用逗号或空格分隔"')}<label>适用页面<small>不选择表示该端所有页面</small><select multiple size="5" name="pages-${i}">${Object.entries(
              pages,
            )
              .map(
                ([key, label]) =>
                  `<option value="${key}" ${r.pages.includes(key) ? 'selected' : ''}>${label}</option>`,
              )
              .join(
                '',
              )}</select></label><div>${field('开始时间（留空立即）', `start-${i}`, 'datetime-local', local(r.startsAt))}${field('结束时间（留空不限）', `end-${i}`, 'datetime-local', local(r.endsAt))}</div>${field('时长（毫秒）', `duration-${i}`, 'number', r.duration, 'required min="1000" max="5000" step="100"')}${field('彩纸数量', `density-${i}`, 'number', r.density, 'required min="16" max="100"')}</div><div class="button-row"><button class="button secondary" type="button" data-celebration-preview="${i}">预览效果</button><button class="text-btn" type="button" data-celebration-remove="${i}">删除规则</button></div></fieldset>`,
        )
        .join(
          '',
        )}</div>${errorHTML}<div class="button-row"><button type="button" class="button secondary" id="celebration-add">新建规则</button><button type="button" class="button secondary" id="celebration-global">新建全局庆祝</button><button class="button" type="submit">确认保存与投放</button></div><p class="muted">新建规则默认关闭。全局庆祝勾选启用并保存后，在用户下次进入页面或在线检查时投放；其他管理员不能修改这里。</p></form>`;
      const form = $('#celebration-form', section);
      const add = (global) => {
        if (rules.length >= 24) {
          toast('最多24条规则');
          return;
        }
        rules = read();
        rules.push({
          id: crypto.randomUUID(),
          title: global ? '全局庆祝' : '新的庆祝规则',
          enabled: false,
          event: 'page-enter',
          channel: global ? 'both' : 'user',
          audience: 'all',
          usernames: [],
          pages: [],
          startsAt: '',
          endsAt: '',
          duration: 2800,
          density: 72,
        });
        draw();
      };
      $('#celebration-add', section).onclick = () => add(false);
      $('#celebration-global', section).onclick = () => add(true);
      section.querySelectorAll('[data-celebration-remove]').forEach(
        (b) =>
          (b.onclick = () => {
            rules = read();
            rules.splice(Number(b.dataset.celebrationRemove), 1);
            draw();
          }),
      );
      section.querySelectorAll('[data-celebration-preview]').forEach(
        (b) =>
          (b.onclick = () => {
            playCelebration(read()[Number(b.dataset.celebrationPreview)]);
          }),
      );
      form.onsubmit = (e) =>
        formSubmit(e, async () => {
          await api('/api/admin/celebrations', 'PUT', { revision: data.revision, rules: read() });
          toast('彩纸规则已保存');
          section.remove();
          await mountCelebrationSettings(host);
        });
    };
    draw();
  } catch (e) {
    if (section.isConnected) section.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
  }
}
