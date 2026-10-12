import { mapSettingsHTML } from '/map-settings.js';
import { esc } from '/shared/ui.js';
import { avatarHTML } from '/shared/profile.js';

// 管理员设置入口。业务规则与权限由 Java 接口处理。
export function createSettingsPages({ state, role }) {
  function settings() {
    return `<div class="settings-grid">${mapSettingsHTML(state.account)}<section class="panel"><h2>管理员账户</h2><div class="admin-own-profile">${avatarHTML(state.account, 'large')}<p class="muted">${esc(state.account.name)}<br>@${esc(state.account.username)}</p></div><button class="button secondary" id="settings-edit-profile">编辑昵称与头像</button><p class="notice">${role(state.account.role)}<br>${state.account.role === 'super' ? '可以创建、删除和调整管理员账号。' : '可以管理用户账号与校园内容。地图配置仅超级管理员验证后可访问。'}</p><button class="button secondary" id="change-password" style="margin-top:20px">修改自己的密码</button><p class="tip" style="margin-top:20px">密码使用随机盐与 scrypt 哈希保存。修改后，其他登录会失效。原型数据已备份，当前账号资料保存在本地项目数据目录。</p></section></div>`;
  }
  return { settings };
}
