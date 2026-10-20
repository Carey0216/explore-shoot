import { $, esc, icon, api, toast } from '/shared/ui.js';
import { avatarHTML } from '/shared/profile.js';
import { setPreferenceAccount } from '/shared/preferences.js';
export function bindAccountMenu({ state, render }) {
  const button = $('#account-open');
  document.querySelector('#account-menu')?.remove();
  if (!button || !state.account) return;
  const account = state.account,
    panel = document.createElement('aside');
  panel.id = 'account-menu';
  panel.className = 'account-menu';
  panel.setAttribute('popover', 'auto');
  panel.setAttribute('aria-label', '账户菜单');
  panel.innerHTML = `<header>${avatarHTML(account)}<div><strong>${esc(account.nickname)}</strong><small>@${esc(account.username)}</small><span>${account.scoutStatus === 'approved' ? '校园探索官' : '校园探索者'}</span></div></header><a href="#me">${icon('user')} 我的内容</a><a href="#settings?section=account">${icon('settings')} 编辑个人资料与账号安全</a><button data-no-liquid id="menu-logout">${icon('logout')} 退出登录</button>`;
  document.body.append(panel);
  button.setAttribute('aria-controls', panel.id);
  button.setAttribute('aria-haspopup', 'dialog');
  let hiding;
  const opened = () => panel.matches(':popover-open');
  const position = () => {
    const rect = button.getBoundingClientRect(),
      width = Math.min(288, innerWidth - 24);
    panel.style.width = width + 'px';
    panel.style.left = Math.max(12, Math.min(innerWidth - width - 12, rect.right - width)) + 'px';
    panel.style.top = Math.min(rect.bottom + 10, innerHeight - 280) + 'px';
  };
  const show = () => {
    clearTimeout(hiding);
    position();
    if (!opened()) panel.showPopover();
  };
  const hide = () => {
    if (opened()) panel.hidePopover();
  };
  button.onclick = () => (opened() ? hide() : show());
  button.onpointerenter = (e) => {
    if (e.pointerType === 'mouse') show();
  };
  button.onpointerleave = (e) => {
    if (e.pointerType === 'mouse') hiding = setTimeout(hide, 220);
  };
  panel.onpointerenter = () => clearTimeout(hiding);
  panel.onpointerleave = (e) => {
    if (e.pointerType === 'mouse') hiding = setTimeout(hide, 220);
  };
  panel.addEventListener('toggle', () => button.setAttribute('aria-expanded', String(opened())));
  panel.querySelectorAll('a').forEach((a) => (a.onclick = hide));
  $('#menu-logout', panel).onclick = async function () {
    this.disabled = true;
    try {
      await api('/api/auth/logout', 'POST', {});
      setPreferenceAccount(null);
      hide();
      window.dispatchEvent(new Event('account:logged-out'));
    } catch (e) {
      this.disabled = false;
      toast(e.message);
    }
  };
}
