import { adminGroups, currentGroup } from './navigation.js';
let campusMapHTML, setupCampusEditor;
let disposeCampusEditor = null;
// 页面调度入口：启动、路由、共享状态和清理。具体页面在 pages/ 中。
const state = {
  account: null,
  data: null,
  page: 'overview',
  query: '',
  filter: 'pending',
  auditEvents: null,
  auditBefore: null,
  auditBusy: false,
  auditFilters: { kind: 'audit', category: 'all', role: 'all', q: '', from: '', to: '' },
  auditTotal: 0,
};
import { bindMapSettings, lockMapSettings } from '/map-settings.js';
import {
  $,
  esc,
  date,
  api,
  icon,
  toast,
  modal,
  closeModal,
  formSubmit,
  errorHTML,
  passwordDialog,
} from '/shared/ui.js';
import { authURL } from '/shared/auth-routing.js';
import { avatarHTML, profileDialog } from '/shared/profile.js';
import { deleteContent } from '/content-deletion.js';

const nav = [
  ['overview', 'discover', '概览'],
  ['invites', 'ticket', '邀请码'],
  ['users', 'people', '用户账号'],
  ['applications', 'shield', '探索官申请'],
  ['points', 'pin', '校园点位'],
  ['shooting-spots', 'camera', '真实机位'],
  ['works', 'camera', '打卡作品审核'],
  ['work-reports', 'list', '作品举报'],
  ['campus-map', 'map', '校园地图'],
  ['reports', 'list', '问题反馈'],
  ['content', 'walk', '路线与任务'],
  ['admins', 'user', '管理员账号'],
  ['settings', 'settings', '设置'],
  ['audit', 'clock', '操作记录'],
];
const role = (r) => (r === 'super' ? '超级管理员' : '普通管理员');
const userName = (id) => {
  const u = state.data.users.find((x) => x.id === id);
  return u ? u.nickname + ' (@' + u.username + ')' : '已删除用户';
};
const pointName = (id) => state.data.points.find((x) => x.id === id)?.name || '未知点位';
const stateText = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
  resolved: '已处理',
  none: '普通用户',
};
const badge = (text, kind = '') => `<span class="pill ${kind}">${esc(text)}</span>`;
function table(head, rows) {
  return `<div class="table-wrap"><table><thead><tr>${head.map((t) => '<th>' + t + '</th>').join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}">暂时没有记录</td></tr>`}</tbody></table></div>`;
}
function tabs() {
  return `<div class="filter-tabs">${[
    ['pending', '待处理'],
    ['all', '全部记录'],
  ]
    .map(
      ([v, t]) =>
        `<button data-filter="${v}" class="${state.filter === v ? 'active' : ''}">${t}</button>`,
    )
    .join('')}</div>`;
}
function confirmAction(title, description, work, danger = false) {
  modal(
    title,
    `<p class="muted">${esc(description)}</p><form id="confirm-form">${errorHTML}<button type="submit" class="button wide ${danger ? 'danger' : ''}">确认${danger ? '删除' : '执行'}</button></form>`,
    (d) => {
      $('#confirm-form', d).onsubmit = (e) =>
        formSubmit(e, async () => {
          await work();
          closeModal();
          await refresh();
          toast('操作已保存');
        });
    },
  );
}
async function mutate(url, method, body) {
  await api(url, method, body);
  await refresh();
  toast('操作已保存');
}
function login() {
  disposeCampusEditor?.();
  disposeCampusEditor = null;
  closeModal();
  location.replace(authURL('admin', 'login', '/#' + state.page));
}
async function refresh() {
  state.data = await api('/api/admin/overview');
  state.account = state.data.account;
  await ensurePage(state.page);
  if (state.page === 'audit') await loadAudit();
  await render();
}
async function render() {
  const revision = ++renderRevision,
    page = state.page;
  try {
    await ensurePage(page);
  } catch (e) {
    if (revision === renderRevision) {
      $('#app').innerHTML =
        '<main class="boot-console"><h1>管理工作台</h1><p role="alert">页面暂时无法加载，请检查网络后重试。</p><button class="button secondary" id="admin-page-retry">重试</button></main>';
      $('#admin-page-retry').onclick = () => render();
    }
    return;
  }
  if (revision !== renderRevision || page !== state.page || !state.account) return;
  disposeCampusEditor?.();
  disposeCampusEditor = null;
  if (state.page !== 'settings') lockMapSettings();
  const allowedNav = nav.filter((x) => state.account.role === 'super' || x[0] !== 'admins');
  if (!allowedNav.some((x) => x[0] === state.page)) state.page = 'overview';
  const name = nav.find((x) => x[0] === state.page)?.[2];
  const links = (mobile) =>
    adminGroups
      .map((g) => [g.id, g.icon, g.label])
      .map(
        ([p, i, t]) =>
          `<a href="#${p}" class="${mobile ? 'button secondary ' : ''}${currentGroup(state.page).id === p ? 'active' : ''}" ${currentGroup(state.page).id === p ? 'aria-current="page"' : ''}>${icon(i)}<span>${t}</span>${p === 'users' && state.data.applications.some((x) => x.status === 'pending') ? ' <span class="pill orange">' + state.data.applications.filter((x) => x.status === 'pending').length + '</span>' : ''}</a>`,
      )
      .join('');
  $('#app').innerHTML =
    `<aside class="admin-nav"><div class="admin-brand">探索与拍摄</div><div class="admin-sub">CAMPUS CONSOLE</div><nav aria-label="管理栏目">${links(false)}</nav><div class="admin-identity">${esc(state.account.name)}<br><small>${role(state.account.role)} · @${esc(state.account.username)}</small></div></aside><div class="admin-content"><div class="admin-top"><header class="admin-header"><div><h1>${name}</h1><p>北方民族大学 · 校园探索管理工作台</p></div><div class="button-row"><button class="admin-account-button" id="admin-edit-profile" aria-label="编辑我的资料">${avatarHTML(state.account)}<span class="admin-account-name">${esc(state.account.name)}</span></button><button id="reload" class="button secondary">刷新</button><button id="logout" class="text-btn">退出</button></div></header><details class="admin-mobile-nav" id="admin-mobile-nav"><summary class="button secondary" aria-label="管理栏目，当前${name}">${icon('list')}<span>管理栏目<small>${name}</small></span><span class="admin-menu-arrow" aria-hidden="true">⌄</span></summary><nav aria-label="手机管理栏目">${links(true)}</nav></details></div><main class="admin-main">${
      currentGroup(state.page).pages.length > 1
        ? `<nav class="admin-subnav" aria-label="${currentGroup(state.page).label}栏目">${allowedNav
            .filter((x) => currentGroup(state.page).pages.includes(x[0]))
            .map(
              ([p, i, t]) =>
                `<a href="#${p}" class="button secondary ${state.page === p ? 'active' : ''}" ${state.page === p ? 'aria-current="page"' : ''}>${icon(i)}${t}</a>`,
            )
            .join('')}</nav>`
        : ''
    }<div id="admin-body">${state.page === 'overview' ? overview() : state.page === 'invites' ? invites() : state.page === 'users' ? users() : state.page === 'applications' ? applications() : state.page === 'points' ? points() : state.page === 'campus-map' ? campusMapHTML() : state.page === 'shooting-spots' ? shootingSpots() : state.page === 'works' ? works() : state.page === 'work-reports' ? workReports() : state.page === 'reports' ? reports() : state.page === 'admins' ? admins() : state.page === 'content' ? content() : state.page === 'settings' ? settings() : auditPage()}</div></main></div>`;
  $('#admin-edit-profile').onclick = () => profileDialog(state.account, async () => refresh());
  $('#logout').onclick = async () => {
    await api('/api/auth/logout', 'POST', {});
    state.account = null;
    login();
  };
  $('#reload').onclick = () => {
    lockMapSettings();
    refresh().catch((e) => toast(e.message));
  };
  $('#admin-mobile-nav').addEventListener('click', (e) => {
    if (e.target.closest('a')) $('#admin-mobile-nav').open = false;
  });
  $('#admin-mobile-nav').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#admin-mobile-nav').open = false;
      $('#admin-mobile-nav summary').focus();
    }
  });
  bind();
  if (state.page === 'campus-map') disposeCampusEditor = setupCampusEditor();
}

function bind() {
  bindMapSettings(state.account);
  const safe = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    }
  };
  const each = (sel, fn) =>
    document.querySelectorAll(sel).forEach((b) => (b.onclick = safe(() => fn(b))));
  each('[data-delete-content]', (b) => {
    const type = b.dataset.deleteContent,
      item = state.data[type].find((x) => x.id === b.dataset.contentId);
    return deleteContent(type, item, refresh);
  });
  bindCommunity();
  bindAudit();
  $('#audit-more')?.addEventListener(
    'click',
    safe(() => loadAudit(true)),
  );
  $('#new-invite')?.addEventListener('click', newInvite);
  $('#new-admin')?.addEventListener('click', () => adminDialog(null));
  $('#settings-edit-profile')?.addEventListener('click', () =>
    profileDialog(state.account, async () => refresh()),
  );
  $('#change-password')?.addEventListener('click', passwordDialog);
  $('#table-search')?.addEventListener('input', (e) => {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = $('#table-search');
    input?.focus();
    input?.setSelectionRange(pos, pos);
  });
  each('[data-filter]', (b) => {
    state.filter = b.dataset.filter;
    render();
  });
  each('[data-copy]', (b) => copy(b.dataset.copy));
  each('[data-invite-toggle]', (b) => {
    const i = state.data.invites.find((x) => x.id === b.dataset.inviteToggle);
    return mutate('/api/admin/invites/' + i.id, 'PATCH', { enabled: !i.enabled });
  });
  each('[data-invite-edit]', (b) =>
    editInvite(state.data.invites.find((x) => x.id === b.dataset.inviteEdit)),
  );
  each('[data-invite-usage]', (b) => {
    const i = state.data.invites.find((x) => x.id === b.dataset.inviteUsage);
    modal(
      '邀请码使用记录',
      `<p class="code">${i.code}</p>${table(
        ['注册用户', '注册时间'],
        i.usage.map(
          (x) => '<tr><td>' + esc(userName(x.userId)) + '</td><td>' + date(x.at) + '</td></tr>',
        ),
      )}<p class="tip">生成者：${esc(i.creator)} · 备注：${esc(i.note || '无')}</p>`,
    );
  });
  each('[data-popularity]', (b) =>
    editPopularity(state.data.points.find((x) => x.id === b.dataset.popularity)),
  );
  each('[data-user-edit]', (b) =>
    editUser(state.data.users.find((x) => x.id === b.dataset.userEdit)),
  );
  each('[data-user-toggle]', (b) => {
    const u = state.data.users.find((x) => x.id === b.dataset.userToggle);
    return mutate('/api/admin/users/' + u.id, 'PATCH', { enabled: !u.enabled });
  });
  each('[data-application]', (b) =>
    reviewApplication(
      state.data.applications.find((x) => x.id === b.dataset.application),
      b.dataset.status,
    ),
  );
  each('[data-point-edit]', (b) =>
    editPoint(state.data.points.find((x) => x.id === b.dataset.pointEdit)),
  );
  each('[data-point-toggle]', (b) => {
    const p = state.data.points.find((x) => x.id === b.dataset.pointToggle);
    return mutate('/api/admin/points/' + p.id, 'PATCH', {
      published: !p.published,
      open: !p.published,
    });
  });
  each('[data-report]', (b) =>
    reviewReport(state.data.reports.find((x) => x.id === b.dataset.report)),
  );
  each('[data-admin-edit]', (b) =>
    adminDialog(state.data.admins.find((x) => x.id === b.dataset.adminEdit)),
  );
  each('[data-route-edit]', (b) =>
    routeDialog(state.data.routes.find((x) => x.id === b.dataset.routeEdit)),
  );
  each('[data-route-toggle]', (b) => {
    const r = state.data.routes.find((x) => x.id === b.dataset.routeToggle);
    return mutate('/api/admin/routes/' + r.id, 'PATCH', { active: !r.active });
  });
  each('[data-template-edit]', (b) =>
    templateDialog(state.data.templates.find((x) => x.id === b.dataset.templateEdit)),
  );
}
window.addEventListener('hashchange', async () => {
  window.scrollTo(0, 0);
  state.page = location.hash.slice(1) || 'overview';
  state.query = '';
  state.filter = 'pending';
  if (state.page !== 'audit') {
    state.auditFilters = { kind: 'audit', category: 'all', role: 'all', q: '', from: '', to: '' };
    state.auditEvents = null;
    state.auditBefore = null;
  }
  if (state.account && state.data) {
    await render();
    if (state.page === 'audit' && loadAudit) loadAudit().catch((e) => toast(e.message));
  }
});
setInterval(async () => {
  if (!state.account || document.hidden || $('#dialog') || state.page === 'campus-map') return;
  try {
    const latest = await api('/api/admin/overview');
    const changed =
      latest.applications.length !== state.data.applications.length ||
      latest.reports.length !== state.data.reports.length ||
      latest.points.length !== state.data.points.length ||
      latest.users.length !== state.data.users.length ||
      latest.version !== state.data.version ||
      JSON.stringify(latest.summary) !== JSON.stringify(state.data.summary) ||
      JSON.stringify(latest.invites) !== JSON.stringify(state.data.invites) ||
      latest.account.name !== state.account.name ||
      latest.account.avatarVersion !== state.account.avatarVersion;
    state.data = latest;
    state.account = latest.account;
    if (
      changed &&
      !$('#provider-settings') &&
      !$('#table-search')?.matches(':focus') &&
      !$('#record-filters')?.contains(document.activeElement)
    )
      render();
  } catch (e) {
    if (e.status === 401) {
      state.account = null;
      login();
      toast('登录已失效，请重新登录');
    }
  }
}, 10000);
let overview,
  invites,
  newInvite,
  editInvite,
  copy,
  users,
  editUser,
  admins,
  adminDialog,
  applications,
  reviewApplication,
  points,
  editPopularity,
  editPoint,
  reports,
  reviewReport,
  content,
  routeDialog,
  templateDialog,
  settings,
  auditPage,
  loadAudit;
let shootingSpots, works, workReports;
let bindCommunity = () => {};
let bindAudit = () => {};
const pageLoads = new Map();
function ensurePage(page) {
  const key =
    {
      overview: 'overview',
      invites: 'invites',
      users: 'accounts',
      admins: 'accounts',
      applications: 'moderation',
      points: 'moderation',
      'shooting-spots': 'community',
      works: 'community',
      'work-reports': 'community',
      reports: 'moderation',
      content: 'content',
      settings: 'settings',
      audit: 'audit',
      'campus-map': 'campus-map',
    }[page] || 'overview';
  if (!pageLoads.has(key))
    pageLoads.set(
      key,
      loadPage(key).catch((e) => {
        pageLoads.delete(key);
        throw e;
      }),
    );
  return pageLoads.get(key);
}
async function loadPage(key) {
  if (key === 'community') {
    const { createCommunityPages } = await import('./pages/community.js');
    ({ shootingSpots, works, workReports, bindCommunity } = createCommunityPages({
      state,
      table,
      refresh,
      pointName,
    }));
  }
  if (key === 'overview') {
    const { createOverviewPages } = await import('./pages/overview.js');
    ({ overview } = createOverviewPages({
      state: state,
      applications: (...args) => applications(...args),
      points: (...args) => points(...args),
      reports: (...args) => reports(...args),
      users: (...args) => users(...args),
      badge: (...args) => badge(...args),
      invites: (...args) => invites(...args),
      userName: (...args) => userName(...args),
    }));
  }
  if (key === 'invites') {
    const { createInvitesPages } = await import('./pages/invites.js');
    ({ invites, newInvite, editInvite, copy } = createInvitesPages({
      table: (...args) => table(...args),
      state: state,
      badge: (...args) => badge(...args),
      refresh: (...args) => refresh(...args),
    }));
  }
  if (key === 'accounts') {
    const { createAccountsPages } = await import('./pages/accounts.js');
    ({ users, editUser, admins, adminDialog } = createAccountsPages({
      state: state,
      invites: (...args) => invites(...args),
      table: (...args) => table(...args),
      badge: (...args) => badge(...args),
      stateText: stateText,
      refresh: (...args) => refresh(...args),
      confirmAction: (...args) => confirmAction(...args),
      role: (...args) => role(...args),
    }));
  }
  if (key === 'moderation') {
    const { createModerationPages } = await import('./pages/moderation.js');
    ({ applications, reviewApplication, points, editPopularity, editPoint, reports, reviewReport } =
      createModerationPages({
        tabs: (...args) => tabs(...args),
        state: state,
        userName: (...args) => userName(...args),
        badge: (...args) => badge(...args),
        stateText: stateText,
        refresh: (...args) => refresh(...args),
        table: (...args) => table(...args),
        role: (...args) => role(...args),
        pointName: (...args) => pointName(...args),
      }));
  }
  if (key === 'content') {
    const { createContentPages } = await import('./pages/content.js');
    ({ content, routeDialog, templateDialog } = createContentPages({
      state: state,
      badge: (...args) => badge(...args),
      points: (...args) => points(...args),
      pointName: (...args) => pointName(...args),
      table: (...args) => table(...args),
      refresh: (...args) => refresh(...args),
    }));
  }
  if (key === 'settings') {
    const { createSettingsPages } = await import('./pages/settings.js');
    ({ settings } = createSettingsPages({ state: state, role: (...args) => role(...args) }));
  }
  if (key === 'audit') {
    const { createAuditPages } = await import('./pages/audit.js');
    ({ auditPage, loadAudit, bindAudit } = createAuditPages({
      state: state,
      role: (...args) => role(...args),
      table: (...args) => table(...args),
      badge: (...args) => badge(...args),
      render: (...args) => render(...args),
    }));
  }

  if (key === 'campus-map')
    ({ campusMapHTML, setupCampusEditor } = await import('./pages/campus-map.js'));
}
let renderRevision = 0;
async function boot() {
  try {
    state.page = location.hash.slice(1) || 'overview';
    window.adminStartup?.ready();
    state.account = window.adminInitialAccount || (await api('/api/auth/me')).account;
    delete window.adminInitialAccount;
    if (state.account) {
      await refresh();
      window.adminStartup?.ready();
    } else login();
  } catch (e) {
    if (e.status === 401) login();
    else {
      $('#app').innerHTML =
        '<main class="boot-console"><h1>管理工作台</h1><p role="alert">暂时无法连接工作台，请检查网络后重试。</p><button class="button secondary" id="admin-page-retry">重试</button></main>';
      $('#admin-page-retry').onclick = boot;
    }
  }
}
window.addEventListener('pagehide', () => {
  disposeCampusEditor?.();
  disposeCampusEditor = null;
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted && state.account && state.page === 'campus-map') render();
});
boot();
