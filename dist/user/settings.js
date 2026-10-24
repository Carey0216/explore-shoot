import { assistantAvatars, assistantAvatar } from '/shared/assistant-avatars.js';
import { $, esc, icon, passwordDialog, toast } from '/shared/ui.js';
import { featureVisible, allowFeature } from '/shared/features.js';
import { profileDialog } from '/shared/profile.js';
import {
  getPreferences,
  updatePreferences,
  preferenceScope,
  subscribePreferences,
} from '/shared/preferences.js';
export const settingsEntry = () =>
  `<a class="settings-entry button secondary" href="#settings">${icon('settings')}<span><strong>设置</strong><small>这些偏好，只属于你。</small></span><b aria-hidden="true">↗</b></a>`;
const options = (choices, selected) =>
  choices
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`,
    )
    .join('');
export function settingsHTML(account) {
  const p = getPreferences();
  return `<section class="settings-page"><a class="button secondary small settings-back" href="#me">← 返回我的</a><header class="settings-heading"><span class="eyebrow">PREFERENCES</span><h1>让体验，贴合你的习惯。</h1><p>这些偏好，只属于你。</p></header><div class="settings-layout"><form id="personal-settings"><section class="settings-card"><h2>显示</h2><label class="setting-row"><span><b>语言 / Language</b><small>跟随设备语言，也可随账号固定选择。</small></span><select name="language" aria-label="语言 / Language">${options(
    [
      ['system', '跟随设备语言'],
      ['zh-CN', '简体中文'],
      ['en-US', 'English'],
    ],
    p.language,
  )}</select></label><label class="setting-row"><span><b>外观</b><small>选择适合当前环境的外观。</small></span><select name="appearance" aria-label="外观">${options(
    [
      ['system', '跟随系统'],
      ['light', '浅色'],
      ['dark', '深色'],
    ],
    p.appearance,
  )}</select></label><label class="setting-row"><span><b>文字大小</b></span><select name="textSize" aria-label="文字大小">${options(
    [
      ['standard', '标准'],
      ['large', '较大'],
    ],
    p.textSize,
  )}</select></label><label class="setting-row"><span><b>动画效果</b></span><select name="motion" aria-label="动画效果">${options(
    [
      ['system', '跟随系统'],
      ['reduce', '减少动画'],
    ],
    p.motion,
  )}</select></label>${
    featureVisible('campus-time')
      ? `<label class="setting-row" data-feature="campus-time"><span><b>校园时段</b><small>全景与三维共用；18:00—次日07:00为傍晚，与界面外观独立。</small></span><select name="campusTime" aria-label="校园时段">${options(
          [
            ['auto', '跟随设备时间'],
            ['day', '白天'],
            ['evening', '傍晚'],
          ],
          p.campusTime,
        )}</select></label>`
      : ''
  }</section><section class="settings-card"><h2>助手形象</h2><fieldset class="assistant-avatar-options"><legend class="sr-only">选择校园助手形象</legend>${Object.entries(
    assistantAvatars,
  )
    .map(
      ([id, a]) =>
        `<label class="assistant-avatar-choice"><input type="radio" name="assistantAvatar" value="${id}" ${p.assistantAvatar === id ? 'checked' : ''}>${assistantAvatar(id)}<span>${a.name}</span></label>`,
    )
    .join(
      '',
    )}</fieldset><p class="muted">形象随账号同步；对话保留在当前浏览器。发送时仅向当前模型提供最近8条上下文。</p></section><section class="settings-card"><h2>导航偏好</h2><label class="setting-row"><span><b>默认跟随位置</b><small>网页导航开启后，地图是否跟随你的当前位置。</small></span><span class="setting-toggle"><input class="setting-switch" type="checkbox" role="switch" name="mapFollow" aria-label="默认跟随位置" ${p.mapFollow ? 'checked' : ''}><span class="setting-toggle-track" aria-hidden="true"></span></span></label><label class="setting-row"><span><b>导航音色</b></span><select name="voiceId" aria-label="导航音色">${options(
    [
      ['he', '暖禾 · 女声'],
      ['qing', '清晴 · 女声'],
      ['lu', '小鹿 · 女声'],
      ['zhou', '舟行 · 男声'],
      ['chuan', '山川 · 男声'],
      ['yu', '晨宇 · 男声'],
    ],
    p.voiceId,
  )}</select></label></section><p class="settings-status" id="settings-save-status" role="status" aria-live="polite"></p></form><aside><section class="settings-card settings-scope"><span class="scope-icon">${icon(account ? 'user' : 'sun')}</span><h2>当前保存位置</h2><strong id="settings-scope">${account ? '当前账号' : '仅此浏览器'}</strong>${account ? `<p class="account-setting-name">@${esc(account.username)}</p>` : ''}<p>${account ? '登录后修改的设置保存到账号，在其他设备登录时自动应用。' : '本机偏好不会覆盖已有账号设置；退出后恢复本机偏好。'}</p></section><section class="settings-card"><h2 id="account-settings-heading" tabindex="-1">账号与安全</h2><button type="button" class="setting-account-action" data-no-liquid id="settings-profile" ${account ? '' : 'disabled'}><span>昵称与头像</span><small>${account ? '↗' : '登录后可用'}</small></button><button type="button" class="setting-account-action" data-no-liquid id="settings-password" ${account ? '' : 'disabled'}><span>修改密码</span><small>${account ? '↗' : '登录后可用'}</small></button>${account ? '<button type="button" class="setting-account-action" data-no-liquid id="settings-logout"><span>退出登录</span><small>↗</small></button>' : '<button type="button" class="button secondary wide" id="settings-login">登录 / 注册</button>'}</section></aside></div></section>`;
}
export function bindSettings({ account, onSaved, onLogin, onLogout }) {
  if (location.hash.includes('section=account'))
    requestAnimationFrame(() => {
      $('#account-settings-heading')?.scrollIntoView({ block: 'start' });
    });
  const form = $('#personal-settings'),
    status = $('#settings-save-status');
  let disposed = false,
    busy = false;
  const sync = () => {
    if (disposed) return;
    const p = getPreferences();
    for (const [key, value] of Object.entries(p)) {
      const el = form.elements.namedItem(key);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = value;
      else el.value = value;
    }
  };
  const unsubscribe = subscribePreferences(sync);
  form.onsubmit = (e) => e.preventDefault();
  form.onchange = async (e) => {
    const el = e.target;
    if (busy || !el.name) return;
    if (el.name === 'campusTime' && !allowFeature('campus-time')) {
      sync();
      return;
    }
    busy = true;
    const patch = { [el.name]: el.type === 'checkbox' ? el.checked : el.value };
    form.querySelectorAll('select,input').forEach((c) => (c.disabled = true));
    status.textContent = '正在保存设置…';
    status.classList.remove('failed');
    try {
      await updatePreferences(patch);
      if (!disposed)
        status.textContent =
          preferenceScope() === 'account'
            ? '已保存到账号，其他设备登录后自动生效'
            : '已保存到此浏览器';
    } catch (error) {
      if (!disposed) {
        sync();
        status.textContent = error.message;
        status.classList.add('failed');
      }
    } finally {
      busy = false;
      if (!disposed) form.querySelectorAll('select,input').forEach((c) => (c.disabled = false));
    }
  };
  $('#settings-profile').onclick = () => {
    if (account) profileDialog(account, onSaved);
  };
  $('#settings-password').onclick = () => {
    if (account) passwordDialog();
  };
  $('#settings-login')?.addEventListener('click', onLogin);
  $('#settings-logout')?.addEventListener('click', () => onLogout().catch((e) => toast(e.message)));
  return () => {
    disposed = true;
    unsubscribe();
    form.onchange = null;
    form.onsubmit = null;
  };
}
