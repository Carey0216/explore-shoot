import { $, api, esc, modal, toast, closeModal, field, errorHTML } from '/shared/ui.js';

const pageNames = {
  shots: '机位',
  assistant: '校园拍照助手',
  discover: '发现',
  map: '地图',
  navigate: '导航',
  routes: '探索',
  place: '地点详情',
  spot: '机位详情',
  me: '我的',
  settings: '设置',
  passport: '护照',
  checkin: '打卡',
  notifications: '通知',
};
const audienceNames = {
  all: '全部用户与游客',
  guest: '仅游客',
  members: '所有已登录用户',
  ordinary: '普通用户',
  scouts: '校园探索官',
  selected: '指定用户',
};
const textArea = (label, name, value, max = 4000) =>
  `<label>${esc(label)}<textarea name="${name}" maxlength="${max}" rows="4">${esc(value)}</textarea></label>`;
const isoLocal = (s) =>
  s
    ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';

export function createSiteContentPages({ state }) {
  const siteContentPage = () =>
    '<section class="panel" id="site-content-host"><p role="status">正在加载站点内容…</p></section>';
  const announcementsPage = () =>
    '<section class="panel" id="announcements-host"><p role="status">正在加载开屏公告…</p></section>';

  async function bindSiteContent() {
    const host = $('#site-content-host');
    if (!host) return;
    try {
      const data = await api('/api/admin/site-content');
      if (!host.isConnected) return;
      const c = data.draft;
      host.innerHTML = `<h2>站点内容设置</h2><p class="muted">保存草稿不会改变用户界面；超级管理员发布后，网页和小程序下次加载即可读取。分类标识保留，名称和说明可编辑。</p><form id="site-copy-form"><div class="settings-grid">${field('项目名称', 'siteName', 'text', c.siteName, 'required maxlength="40"')}${field('校园名称', 'campusName', 'text', c.campusName, 'required maxlength="40"')}</div>${textArea('页面公告条（可留空，不是开屏弹窗）', 'notice', c.notice)}${textArea('项目介绍', 'about', c.about)}${textArea('帮助说明', 'help', c.help)}${textArea('拍摄与通行建议', 'shootingGuide', c.shootingGuide)}<h3>机位分类</h3>${copyRows(c.categories, 'categories')}<h3>拍摄条件</h3>${copyRows(c.conditions, 'conditions')}${errorHTML}<div class="button-row"><button type="submit" class="button secondary" value="draft">保存草稿</button><button type="button" class="button secondary" id="copy-preview">预览草稿</button>${state.account.role === 'super' ? '<button type="submit" class="button" value="publish">发布内容</button><button type="submit" class="button danger" value="unpublish">下线并恢复默认文案</button>' : '<span class="muted">发布与恢复默认由超级管理员操作</span>'}</div><p class="tip">已发布时间：${esc(data.publishedAt ? new Date(data.publishedAt).toLocaleString() : '默认文案')}。正文按纯文本显示，不执行HTML。</p></form>`;
      const form = $('#site-copy-form', host);
      function content() {
        const f = new FormData(form),
          out = {};
        for (const k of ['siteName', 'campusName', 'notice', 'about', 'help', 'shootingGuide'])
          out[k] = String(f.get(k) || '');
        for (const group of ['categories', 'conditions'])
          out[group] = c[group].map((r, i) => ({
            id: r.id,
            label: String(f.get(`${group}-${i}-label`) || ''),
            description: String(f.get(`${group}-${i}-description`) || ''),
          }));
        return out;
      }
      $('#copy-preview', host).onclick = () => {
        const v = content();
        modal(
          '站点文案预览',
          `<h3>${esc(v.siteName)} · ${esc(v.campusName)}</h3>${['notice', 'about', 'help', 'shootingGuide'].map((k) => `<p class="site-copy">${esc(v[k])}</p>`).join('')}${[...v.categories, ...v.conditions].map((r) => `<p><b>${esc(r.label)}</b> ${esc(r.description)}</p>`).join('')}`,
        );
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const buttons = [...form.querySelectorAll('button')];
        buttons.forEach((b) => (b.disabled = true));
        $('.form-error', form).textContent = '';
        try {
          await api('/api/admin/site-content', 'PUT', {
            revision: data.revision,
            action: e.submitter?.value || 'draft',
            content: content(),
          });
          await bindSiteContent();
          toast('站点内容已保存');
        } catch (error) {
          $('.form-error', form).textContent = error.message;
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      };
    } catch (error) {
      if (host.isConnected) host.textContent = error.message;
    }
  }

  function copyRows(rows, group) {
    return rows
      .map(
        (r, i) =>
          `<div class="settings-grid">${field(`${r.label} · 显示名称`, `${group}-${i}-label`, 'text', r.label, 'required maxlength="20"')}${field('说明', `${group}-${i}-description`, 'text', r.description, 'maxlength="500"')}</div>`,
      )
      .join('');
  }

  async function bindAnnouncements() {
    const host = $('#announcements-host');
    if (!host) return;
    try {
      const data = await api('/api/admin/announcements');
      if (!host.isConnected) return;
      host.innerHTML = `<div class="section-heading"><h2>开屏公告</h2><button class="button" id="new-announcement">新增公告</button></div><p class="muted">可按网页 / 小程序、页面、用户、时间投放。每次进入最多弹出一条，优先级高的先展示；登录用户的次数跨设备共用，游客按本机标识计算。</p><label>搜索公告<input id="announcement-search" type="search" maxlength="80" placeholder="搜索标题或正文"></label><div id="announcement-list"></div>`;
      const draw = () => {
        const query = $('#announcement-search', host).value.trim();
        $('#announcement-list', host).innerHTML =
          data.items
            .filter((r) => `${r.draft.title} ${r.draft.body}`.includes(query))
            .map(
              (r) =>
                `<article class="review-card"><span class="pill">${r.published ? '已发布（按范围 / 时间投放）' : '草稿 / 已下线'}</span><h3>${esc(r.draft.title)}</h3><p>${esc(r.draft.body.slice(0, 160))}</p><p class="muted">${esc(audienceNames[r.draft.audience])} · 总上限 ${r.draft.maxTotal || '不限'} · 每日 ${r.draft.maxDaily || '不限'} · 优先级 ${r.draft.priority}</p><button class="button secondary small" data-edit-announcement="${r.id}">编辑 / 预览 / 发布</button></article>`,
            )
            .join('') || '<p class="empty">暂无公告。新增后先预览，再发布。</p>';
        host
          .querySelectorAll('[data-edit-announcement]')
          .forEach(
            (b) =>
              (b.onclick = () =>
                editAnnouncement(data.items.find((r) => r.id === b.dataset.editAnnouncement))),
          );
      };
      $('#new-announcement', host).onclick = () => editAnnouncement(null);
      $('#announcement-search', host).oninput = draw;
      draw();
    } catch (error) {
      if (host.isConnected) host.textContent = error.message;
    }
  }

  function editAnnouncement(row) {
    const c = row?.draft || {
      title: '',
      body: '',
      channels: ['web', 'mini'],
      pages: [],
      audience: 'all',
      userIds: [],
      startsAt: '',
      endsAt: '',
      maxTotal: 1,
      maxDaily: 1,
      intervalMinutes: 0,
      priority: 100,
    };
    modal(
      row ? '编辑开屏公告' : '新增开屏公告',
      `<form id="announcement-form">${field('标题', 'title', 'text', c.title, 'required maxlength="80"')}${textArea('正文', 'body', c.body, 6000)}<fieldset><legend>客户端范围</legend>${[
        ['web', '网页'],
        ['mini', '微信小程序'],
      ]
        .map(
          ([id, label]) =>
            `<label class="check-line"><input type="checkbox" name="channels" value="${id}" ${c.channels.includes(id) ? 'checked' : ''}>${label}</label>`,
        )
        .join(
          '',
        )}</fieldset><fieldset><legend>页面范围（都不选表示所有支持页面）</legend><div class="settings-grid">${Object.entries(
        pageNames,
      )
        .map(
          ([id, label]) =>
            `<label class="check-line"><input type="checkbox" name="pages" value="${id}" ${c.pages.includes(id) ? 'checked' : ''}>${label}</label>`,
        )
        .join('')}</div></fieldset><label>投放对象<select name="audience">${Object.entries(
        audienceNames,
      )
        .map(
          ([id, label]) =>
            `<option value="${id}" ${id === c.audience ? 'selected' : ''}>${label}</option>`,
        )
        .join(
          '',
        )}</select></label><label>指定用户（仅“指定用户”生效，可多选）<input id="announcement-user-search" type="search" placeholder="查找昵称 / 账号"><select name="userIds" aria-label="指定接收用户" multiple size="5">${state.data.users
        .filter((u) => !u.deleted)
        .map(
          (u) =>
            `<option value="${esc(u.id)}" ${c.userIds.includes(u.id) ? 'selected' : ''}>${esc(u.nickname)} @${esc(u.username)}</option>`,
        )
        .join(
          '',
        )}</select></label><div class="settings-grid">${field('开始时间（本机时区，可留空）', 'startsAt', 'datetime-local', isoLocal(c.startsAt))}${field('结束时间（可留空）', 'endsAt', 'datetime-local', isoLocal(c.endsAt))}${field('每人总展示次数（0不限）', 'maxTotal', 'number', c.maxTotal, 'required min="0" max="10000"')}${field('每人每日展示次数（0不限，北京时间）', 'maxDaily', 'number', c.maxDaily, 'required min="0" max="1000"')}${field('最短间隔（分钟）', 'intervalMinutes', 'number', c.intervalMinutes, 'required min="0" max="525600"')}${field('优先级（数字越高越优先）', 'priority', 'number', c.priority, 'required min="0" max="1000"')}</div><p class="tip">每条公告每次进入最多展示一次；修改 / 重新发布保留已有次数。需要重新投放给已看过的人时创建新公告。游客清除本机存储后无法继续识别次数。</p><section id="announcement-preview" hidden></section>${errorHTML}<div class="button-row"><button type="button" id="preview-announcement" class="button secondary">预览</button><button type="submit" value="draft" class="button secondary">存草稿</button><button type="submit" value="publish" class="button">发布公告</button>${row ? '<button type="submit" value="unpublish" class="button danger">下线公告</button>' : ''}</div></form>`,
      (d) => {
        const form = $('#announcement-form', d);
        const input = () => {
          const f = new FormData(form),
            value = Object.fromEntries(f);
          for (const k of ['channels', 'pages']) value[k] = f.getAll(k);
          value.userIds = value.audience === 'selected' ? f.getAll('userIds') : [];
          for (const k of ['maxTotal', 'maxDaily', 'intervalMinutes', 'priority'])
            value[k] = Number(value[k]);
          for (const k of ['startsAt', 'endsAt'])
            value[k] = value[k] ? new Date(value[k]).toISOString() : '';
          return value;
        };
        $('#announcement-user-search', d).oninput = (e) =>
          form
            .querySelectorAll('[name=userIds] option')
            .forEach((o) => (o.hidden = !o.textContent.includes(e.target.value.trim())));
        $('#preview-announcement', d).onclick = () => {
          const v = input(),
            preview = $('#announcement-preview', d);
          preview.hidden = false;
          preview.innerHTML = `<article class="notice"><h3>${esc(v.title)}</h3><p class="site-copy">${esc(v.body)}</p><span class="pill">预览 · 不增加展示次数</span></article>`;
        };
        form.onsubmit = async (e) => {
          e.preventDefault();
          const buttons = [...form.querySelectorAll('button')];
          buttons.forEach((b) => (b.disabled = true));
          $('.form-error', form).textContent = '';
          try {
            await api(
              '/api/admin/announcements' + (row ? '/' + row.id : ''),
              row ? 'PUT' : 'POST',
              {
                revision: row?.revision || 0,
                action: e.submitter?.value || 'draft',
                content: input(),
              },
            );
            closeModal();
            await bindAnnouncements();
            toast('公告已保存');
          } catch (error) {
            $('.form-error', form).textContent = error.message;
          } finally {
            buttons.forEach((b) => (b.disabled = false));
          }
        };
      },
    );
  }
  return { siteContentPage, announcementsPage, bindSiteContent, bindAnnouncements };
}
