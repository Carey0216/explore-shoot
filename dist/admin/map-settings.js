import { $, esc, api, modal, closeModal, formSubmit, field, errorHTML, toast } from '/shared/ui.js';
let verification = null,
  settings = null,
  selectedProvider = null,
  expiry = 0,
  timer = null,
  generation = 0;
export function lockMapSettings() {
  generation++;
  clearTimeout(timer);
  const token = verification;
  verification = null;
  settings = null;
  selectedProvider = null;
  expiry = 0;
  if (token) api('/api/admin/map-config/lock', 'POST', { verification: token }).catch(() => {});
}
export function mapSettingsHTML(account) {
  if (account.role !== 'owner') return '';
  return `<section class="panel" id="secure-map-settings"><h2>地图与 SDK 配置</h2>${account.role === 'owner' ? '<p class="notice">配置默认锁定。请再次验证顶级管理员账号与密码后查看或修改。</p><button class="button secondary" id="unlock-map-settings">验证并查看配置</button>' : '<p class="notice">仅顶级管理员验证后可查看或修改地图配置。</p>'}</section>`;
}
function show() {
  const root = $('#secure-map-settings');
  if (!root || !verification || expiry <= Date.now()) return;
  const selected = selectedProvider || settings.mapProvider || 'tencent',
    name = { tencent: '腾讯地图', amap: '高德地图', baidu: '百度地图' },
    key = { tencent: 'tencentKey', amap: 'amapKey', baidu: 'baiduKey' }[selected];
  root.innerHTML = `<div class="button-row"><h2>地图与 SDK 配置</h2><button class="text-btn" id="lock-map-settings">立即锁定</button></div><p class="notice">当前启用：${name[settings.mapProvider] || '未启用'} · 验证 3 分钟内有效</p><form id="provider-settings"><label>配置地图服务<select name="mapProvider">${Object.entries(
    name,
  )
    .map(
      ([id, label]) =>
        `<option value="${id}" ${id === selected ? 'selected' : ''}>${label}</option>`,
    )
    .join(
      '',
    )}</select></label>${field(name[selected] + ' Web JS API Key', key, 'text', settings[key] || '', 'maxlength="100" autocomplete="off" spellcheck="false"')}${selected === 'amap' ? field('高德安全密钥（' + (settings.amapSecurityConfigured ? '已配置；留空保留' : '尚未配置') + '）', 'amapSecurity', 'password', '', 'maxlength="100" autocomplete="off"') + '<label><input type="checkbox" name="clearAmapSecurity"> 清除已保存的高德安全密钥</label>' : ''}<p class="tip">${selected === 'tencent' ? '腾讯 GL 地图、WebService 步行服务与 H5 定位。请为 Key 开启所需服务并分配额度。' : selected === 'amap' ? '高德 JS API 2.0、步行规划与定位插件。安全密钥由本机代理添加，不会发送给前端。' : '百度 JS API GL 与步行规划；精确定位使用浏览器 GPS，避免 IP 定位误导。请创建浏览器端 AK 并设置来源白名单。'}</p>${errorHTML}<div class="button-row"><button type="submit" class="button secondary" name="action" value="save">仅保存配置</button><button type="submit" class="button" name="action" value="activate">保存并启用</button></div><p class="tip">分别保留三家的配置；启用仅改变当前服务。网页 SDK 的公开 Key 需要域名白名单保护。留空保存会清除所选 Key，若它正被启用，地图将提示不可用。</p></form>`;
  root.querySelector('[name="mapProvider"]').onchange = (e) => {
    selectedProvider = e.target.value;
    show();
  };
  $('#lock-map-settings').onclick = () => {
    lockMapSettings();
    root.outerHTML = mapSettingsHTML({ role: 'owner' });
    bindMapSettings({ role: 'owner' });
  };
  $('#provider-settings').onsubmit = (e) => {
    const activate = e.submitter?.value === 'activate';
    formSubmit(e, async (f) => {
      const token = verification,
        stamp = generation;
      await api('/api/admin/settings', 'PATCH', {
        ...f,
        clearAmapSecurity: f.clearAmapSecurity === 'on',
        verification: token,
        activate,
        action: undefined,
      });
      if (stamp !== generation) return;
      settings = await api('/api/admin/map-config/read', 'POST', { verification: token });
      show();
      toast(activate ? '地图配置已保存并启用，请刷新用户端' : '地图配置已保存');
    });
  };
}
export function bindMapSettings(account) {
  const button = $('#unlock-map-settings');
  if (!button) return;
  if (account.role !== 'owner') return;
  if (verification && expiry > Date.now()) {
    show();
    return;
  }
  button.onclick = () =>
    modal(
      '验证顶级管理员',
      `<p class="notice">仅当前顶级管理员可打开此入口。可用任意已启用顶级管理员的账号与密码完成二次验证；不会切换登录账号。</p><form id="map-unlock">${field('顶级管理员账号', 'username', 'text', '', 'required maxlength="32" autocomplete="username"')}${field('顶级管理员密码', 'password', 'password', '', 'required maxlength="128" autocomplete="current-password"')}${errorHTML}<button type="submit" class="button wide">验证并查看</button></form>`,
      (dialog) => {
        $('#map-unlock', dialog).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            const stamp = generation;
            const grant = await api('/api/admin/map-config/unlock', 'POST', f);
            if (stamp !== generation) return;
            verification = grant.token;
            expiry = grant.expiresAt;
            settings = await api('/api/admin/map-config/read', 'POST', { verification });
            closeModal();
            show();
            clearTimeout(timer);
            timer = setTimeout(
              () => {
                lockMapSettings();
                const root = $('#secure-map-settings');
                if (root) {
                  root.outerHTML = mapSettingsHTML({ role: 'owner' });
                  bindMapSettings({ role: 'owner' });
                }
              },
              Math.max(0, expiry - Date.now()),
            );
          });
      },
    );
}
window.addEventListener('pagehide', () => {
  lockMapSettings();
  const root = $('#secure-map-settings');
  if (root) root.outerHTML = mapSettingsHTML({ role: 'owner' });
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) bindMapSettings({ role: 'owner' });
});
