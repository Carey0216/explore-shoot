import { mapSettingsHTML } from '/map-settings.js';
import { esc } from '/shared/ui.js';
import { avatarHTML } from '/shared/profile.js';

// 管理员设置入口。业务规则与权限由 Java 接口处理。
export function createSettingsPages({ state, role }) {
  function settings() {
    return `<div class="settings-grid">${state.account.role === 'owner' ? mapSettingsHTML(state.account) : ''}<section class="panel"><h2>管理员账户</h2><div class="admin-own-profile">${avatarHTML(state.account, 'large')}<p class="muted">${esc(state.account.name)}<br>@${esc(state.account.username)}</p></div><button class="button secondary" id="settings-edit-profile">编辑昵称与头像</button><p class="notice">${role(state.account.role)}<br>${state.account.role === 'owner' ? '可以管理所有管理员、交互配置与地图SDK。' : '按已获授权维护用户和校园内容。'}</p><button class="button secondary" id="change-password" style="margin-top:20px">修改自己的密码</button><p class="tip" style="margin-top:20px">密码使用随机盐与 scrypt 哈希保存。修改后，其他登录会失效。原型数据已备份，当前账号资料保存在本地项目数据目录。</p></section></div>`;
  }
  return { settings };
}
