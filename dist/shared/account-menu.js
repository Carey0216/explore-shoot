import { controlPopover } from './popover-controller.js';
import { $, esc, icon, api, toast } from './ui.js';
import { avatarHTML } from './profile.js';
import { setPreferenceAccount } from './preferences.js';
let disposeMenu;
export function bindAccountMenu({ state, administrator = false, onLogout, onProfile }) {
  disposeMenu?.();
  const button = $('#account-open');
  document.querySelector('#account-menu')?.remove();
  if (!button || !state.account) return;
  const account = state.account,
    panel = document.createElement('aside');
  panel.id = 'account-menu';
  panel.className = 'account-menu';
  panel.setAttribute('popover', 'auto');
  panel.setAttribute('aria-label', '账户菜单');
  const label = administrator
    ? { owner: '顶级管理员', super: '超级管理员', normal: '普通管理员' }[account.role] || '管理员'
    : account.scoutStatus === 'approved'
      ? '校园探索官'
      : '校园探索者';
  panel.innerHTML = `<header>${avatarHTML(account)}<div><strong>${esc(account.nickname || account.name || account.username)}</strong><small>@${esc(account.username)}</small><span>${label}</span></div></header><a href="${administrator ? '#overview' : '#me'}">${icon('user')} ${administrator ? '管理工作台' : '我的内容'}</a>${administrator ? `<button data-no-liquid id="menu-profile">${icon('user')} 编辑个人资料</button>` : ''}<a href="${administrator ? '#settings' : '#settings?section=account'}">${icon('settings')} ${administrator ? '账户设置与账号安全' : '编辑个人资料与账号安全'}</a><button data-no-liquid id="menu-logout">${icon('logout')} 退出登录</button>`;

  document.body.append(panel);
  button.setAttribute('aria-controls', panel.id);
  button.setAttribute('aria-haspopup', 'dialog');
  const position = () => {
    const rect = button.getBoundingClientRect(),
      width = Math.min(288, innerWidth - 24);
    panel.style.width = width + 'px';
    panel.style.left = Math.max(12, Math.min(innerWidth - width - 12, rect.right - width)) + 'px';
    panel.style.maxHeight = Math.max(120, innerHeight - 24) + 'px';
    panel.style.overflowY = 'auto';
    panel.style.top = Math.max(12, Math.min(rect.bottom + 10, innerHeight - 280)) + 'px';
  };
  const controller = controlPopover(button, panel, { position });
  const reposition = () => {
    if (controller.isOpen()) position();
  };
  window.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  disposeMenu = () => {
    window.removeEventListener('resize', reposition);
    window.visualViewport?.removeEventListener('resize', reposition);
    controller.destroy();
  };
  const hide = () => controller.close();
  panel.querySelectorAll('a').forEach((a) => (a.onclick = hide));
  if (administrator)
    $('#menu-profile', panel)?.addEventListener('click', () => {
      hide();
      onProfile?.();
    });
  $('#menu-logout', panel).onclick = async function () {
    this.disabled = true;
    try {
      await api('/api/auth/logout', 'POST', {});
      setPreferenceAccount(null);
      if (onLogout) {
        hide();
        onLogout();
        return;
      }
      hide();
      window.dispatchEvent(new Event('account:logged-out'));
    } catch (e) {
      this.disabled = false;
      toast(e.message);
    }
  };
}
