import { mapSettingsHTML } from '/map-settings.js';
import { esc } from '/shared/ui.js';
import { avatarHTML } from '/shared/profile.js';
import { getPreferences } from '/shared/preferences.js';

// 管理员设置入口。业务规则与权限由 Java 接口处理。
export function createSettingsPages({ state, role }) {
  function settings() {
    return `<div class="settings-grid"><section class="panel"><h2>显示与语言</h2><label>语言 / Language<select id="admin-language">${[
      ['system', '跟随设备语言'],
      ['zh-CN', '简体中文'],
      ['en-US', 'English'],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${getPreferences().language === value ? 'selected' : ''}>${label}</option>`,
      )
      .join(
        '',
      )}</select></label><p class="muted">语言偏好会随账号保存，链接语言只临时覆盖。</p><label>主题<select id="admin-appearance" aria-label="外观">${[
      ['system', '跟随系统'],
      ['light', '浅色'],
      ['dark', '深色'],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${getPreferences().appearance === value ? 'selected' : ''}>${label}</option>`,
      )
      .join(
        '',
      )}</select></label><p id="admin-appearance-status" role="status">默认跟随系统；手动选择随管理员账号保存。</p></section>${state.account.role === 'owner' ? mapSettingsHTML(state.account) : ''}${state.account.role === 'owner' ? '<section class="panel"><h2>运行状态</h2><button class="button secondary" id="runtime-metrics">刷新运行指标</button><div id="runtime-result" role="status"></div><h3>图片缓存</h3><p class="muted">统计本次进程启动后的磁盘缩略图命中情况；不包含浏览器本地命中。</p><button class="button secondary" id="image-cache-stats">查看命中统计</button><p id="image-cache-result" role="status"></p></section>' : ''}<section class="panel"><h2>管理员账户</h2><div class="admin-own-profile">${avatarHTML(state.account, 'large')}<p class="muted">${esc(state.account.name)}<br>@${esc(state.account.username)}</p></div><button class="button secondary" id="settings-edit-profile">编辑昵称与头像</button><p class="notice">${role(state.account.role)}<br>${state.account.role === 'owner' ? '可以管理所有管理员、交互配置与地图SDK。' : '按已获授权维护用户和校园内容。'}</p><button class="button secondary" id="change-password" style="margin-top:20px">修改自己的密码</button><p class="tip" style="margin-top:20px">密码使用随机盐与 scrypt 哈希保存。修改后，其他登录会失效。原型数据已备份，当前账号资料保存在本地项目数据目录。</p></section></div>`;
  }
  return { settings };
}
