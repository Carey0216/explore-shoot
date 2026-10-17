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
  field,
  errorHTML,
} from '/shared/ui.js';

// 用户与管理员账号页面。业务规则与权限由 Java 接口处理。
export function createAccountsPages({
  state,
  table,
  badge,
  stateText,
  refresh,
  confirmAction,
  role,
}) {
  function users() {
    const list = state.data.users.filter(
      (u) =>
        !state.query ||
        [u.username, u.nickname, state.data.invites.find((i) => i.id === u.inviteId)?.code]
          .join(' ')
          .toLowerCase()
          .includes(state.query.toLowerCase()),
    );
    return `<div class="toolbar"><input id="table-search" placeholder="搜索账号、昵称或邀请码" aria-label="搜索用户" value="${esc(state.query)}"><span class="muted">${list.length} 个用户 · 管理员不在此列表注册</span></div><section class="panel">${table(
      ['用户', '加入时间', '注册邀请码', '探索官身份', '账号状态', '操作'],
      list.map(
        (u) =>
          `<tr><td><strong>${esc(u.nickname)}</strong><small>@${esc(u.username)}</small></td><td>${date(u.createdAt)}</td><td><span class="code">${esc(state.data.invites.find((i) => i.id === u.inviteId)?.code || (u.inviteId ? '历史邀请码' : u.registrationMethod === 'open' ? '公开注册' : '旧账号'))}</span></td><td>${badge(u.scoutStatus === 'approved' ? '校园探索官' : stateText[u.scoutStatus] || '申请未通过', u.scoutStatus === 'approved' ? 'green' : u.scoutStatus === 'pending' ? 'orange' : '')}</td><td>${badge(u.enabled ? '正常' : '已停用', u.enabled ? 'green' : 'red')}</td><td><div class="button-row"><button class="button secondary small" data-user-edit="${u.id}">管理</button><button class="text-btn" data-user-toggle="${u.id}">${u.enabled ? '停用' : '启用'}</button></div></td></tr>`,
      ),
    )}</section>`;
  }

  function editUser(u) {
    modal(
      '管理用户 · ' + u.nickname,
      `<form id="user-edit-form"><p class="muted">@${esc(u.username)} · 注册邀请码 ${esc(state.data.invites.find((i) => i.id === u.inviteId)?.code || '—')}</p><label>探索官权限<select name="scoutStatus"><option value="none" ${u.scoutStatus !== 'approved' ? 'selected' : ''}>普通用户</option><option value="approved" ${u.scoutStatus === 'approved' ? 'selected' : ''}>校园探索官</option></select></label>${field('重置密码（留空保持当前密码）', 'password', 'password', '', 'minlength="8" maxlength="128" autocomplete="new-password"')}${errorHTML}<button class="button wide" type="submit">保存账号调整</button></form><button class="text-btn" id="delete-user" style="color:#bb5749;margin-top:15px">删除用户账号</button><p class="tip">调整账号权限或密码后，现有登录会失效。删除账号会撤销登录权限，并保留必要的内容与审计关联。</p>`,
      (d) => {
        $('#user-edit-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            const body = {};
            if ((u.scoutStatus === 'approved') !== (f.scoutStatus === 'approved'))
              body.scoutStatus = f.scoutStatus;
            if (f.password) body.password = f.password;
            if (!Object.keys(body).length) {
              closeModal();
              return;
            }
            await api('/api/admin/users/' + u.id, 'PATCH', body);
            closeModal();
            await refresh();
            toast('账号调整已保存');
          });
        $('#delete-user', d).onclick = () =>
          confirmAction(
            '删除用户账号？',
            '将撤销 ' + u.nickname + ' 的登录权限，保留其已发布内容与审计记录。',
            () => api('/api/admin/users/' + u.id, 'DELETE'),
            true,
          );
      },
    );
  }

  function admins() {
    return `<div class="toolbar"><p class="muted" style="margin:0">顶级管理员管理所有管理员与单账号功能授权。管理员不能在用户端注册。</p><button class="button" id="new-admin">${icon('plus')} 创建管理员</button></div><section class="panel">${table(
      ['管理员', '权限', '状态', '创建时间', '操作'],
      state.data.admins.map(
        (a) =>
          `<tr><td><strong>${esc(a.name)}</strong><small>@${esc(a.username)} ${a.id === state.account.id ? '· 当前账号' : ''}</small></td><td>${badge(role(a.role), a.role === 'super' ? 'green' : '')}</td><td>${badge(a.enabled ? '正常' : '已停用', a.enabled ? 'green' : '')}</td><td>${date(a.createdAt)}</td><td><button class="button secondary small" data-admin-edit="${a.id}">管理账号</button>${state.account.role === 'owner' && a.role !== 'owner' ? `<button class="text-btn" data-permissions="${a.id}">功能授权</button>` : ''}</td></tr>`,
      ),
    )}</section><p class="tip">管理员按单项授权维护内容与用户。唯一顶级管理员管理管理员账号、交互开关和模型配置；统计和地图 SDK 按功能授权校验。</p>`;
  }

  function adminDialog(a) {
    const isNew = !a;
    modal(
      isNew ? '创建管理员' : '管理管理员账号',
      `<form id="admin-edit-form">${isNew ? field('管理员账号', 'username', 'text', '', 'required pattern="[A-Za-z0-9_]+" minlength="3" maxlength="32" autocomplete="off"') : '<p class="muted">@' + esc(a.username) + '</p>'}${field('显示名称', 'name', 'text', a?.name || '', 'required maxlength="30"')}<label>账号权限<select name="role"><option value="normal" ${a?.role === 'normal' ? 'selected' : ''}>普通管理员</option><option value="super" ${a?.role === 'super' ? 'selected' : ''}>超级管理员</option></select></label>${field(isNew ? '初始密码（至少 8 位）' : '重置密码（留空保持当前密码）', 'password', 'password', '', 'minlength="8" maxlength="128" autocomplete="new-password" ' + (isNew ? 'required' : ''))}${!isNew ? '<label>账号状态<select name="enabled"><option value="true" ' + (a.enabled ? 'selected' : '') + '>正常</option><option value="false" ' + (!a.enabled ? 'selected' : '') + '>停用</option></select></label>' : ''}${errorHTML}<button class="button wide" type="submit">${isNew ? '创建账号' : '保存调整'}</button></form>${!isNew && a.id !== state.account.id ? '<button class="text-btn" id="delete-admin" style="color:#bb5749;margin-top:15px">删除管理员账号</button>' : ''}<p class="tip">存在顶级管理员后可按需调整其他管理员。当前登录账号不可自行降权、停用或删除。修改自己的密码请在「设置」中操作。</p>`,
      (d) => {
        $('#admin-edit-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            if (!isNew && a.id === state.account.id && f.password)
              throw Error('修改自己的密码请在设置中验证当前密码后操作');
            const b = { ...f };
            if (!isNew) {
              b.enabled = f.enabled === 'true';
              if (!f.password) delete b.password;
            }
            await api('/api/admin/admins' + (isNew ? '' : '/' + a.id), isNew ? 'POST' : 'PATCH', b);
            closeModal();
            await refresh();
            toast(isNew ? '管理员账号已创建' : '管理员账号已调整');
          });
        $('#delete-admin', d)?.addEventListener('click', () =>
          confirmAction(
            '删除管理员账号？',
            '将删除 ' + a.name + ' 的管理员账号并撤销现有登录。操作记录会保留。',
            () => api('/api/admin/admins/' + a.id, 'DELETE'),
            true,
          ),
        );
      },
    );
  }
  return { users, editUser, admins, adminDialog };
}
