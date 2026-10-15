import { setPreferenceAccount } from './preferences.js';
import { $, api, esc, icon, field, errorHTML, formSubmit } from './ui.js';
import { safeReturn, authURL } from './auth-routing.js';
const audience = document.body.dataset.audience,
  register = audience === 'user' && document.body.dataset.mode === 'register',
  admin = audience === 'admin';
const destination = safeReturn(audience, new URLSearchParams(location.search).get('return'));
const brand = `<span class="auth-brand-mark">${icon('camera')}</span>探索与拍摄`;
$('#auth-root').innerHTML =
  `<main class="auth-layout ${admin ? 'console-auth' : ''}"><section class="auth-form-side"><div class="auth-topline">${admin ? '<span>管理员专属入口</span>' : `<a href="${esc(destination)}">← 返回校园</a>`}<span>探索与拍摄</span></div><div class="auth-form-card"><a class="auth-brand" href="${admin ? '/login.html' : '/#shots'}">${brand}</a><h2>${register ? '创建账号' : admin ? '登录管理工作台' : '登录'}</h2><p class="auth-description">${admin ? '请使用超级管理员为你创建的账号。' : register ? '无需邀请码也可注册。普通账号可申请校园探索官，有效邀请码可直接加入。' : '登录以同步收藏、打卡与个人设置。'}</p>${admin ? '' : `<nav class="auth-switch" aria-label="登录方式"><a href="${esc(authURL(audience, 'login', destination))}" class="${!register ? 'active' : ''}">账号登录</a><a href="${esc(authURL(audience, 'register', destination))}" class="${register ? 'active' : ''}">账号注册</a></nav>`}<form id="auth-form">${field(admin ? '管理员账号' : '账号', 'username', 'text', '', 'required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="字母、数字或下划线"')}${register ? field('昵称', 'nickname', 'text', '', 'required maxlength="24" autocomplete="nickname" placeholder="大家怎么称呼你"') : ''}<div class="auth-password-field">${field('密码', 'password', 'password', '', 'required minlength="8" maxlength="128" autocomplete="' + (register ? 'new-password' : 'current-password') + '" placeholder="至少 8 位"')}<button type="button" id="password-visibility" aria-label="显示密码">显示</button></div>${register ? field('确认密码', 'confirm', 'password', '', 'required minlength="8" maxlength="128" autocomplete="new-password" placeholder="再次输入密码"') + field('邀请码（选填）', 'inviteCode', 'text', '', 'minlength="6" maxlength="30" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="有邀请码可直接成为校园探索官"') : ''}${errorHTML}<button class="button wide auth-submit" type="submit">${register ? '注册并进入校园' : admin ? '进入工作台' : '登录'}<span aria-hidden="true">↗</span></button></form><p class="auth-footnote">${admin ? '管理员账号不开放自行注册。' : '你的打卡和私人手记仅自己可见。'}</p>${!admin && !register ? '<div class="auth-entry-links"><a class="auth-admin-link" href="/admin/">管理端入口 <span aria-hidden="true">↗</span></a></div>' : ''}</div><footer class="auth-footer">北方民族大学校园探索与拍摄 · 试点项目</footer></section></main>`;
$('#password-visibility').onclick = () => {
  const input = $('[name=password]'),
    visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  $('#password-visibility').textContent = visible ? '隐藏' : '显示';
  $('#password-visibility').setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
};
$('#auth-form').onsubmit = (e) =>
  formSubmit(e, async (f) => {
    if (register && f.password !== f.confirm) throw Error('两次密码输入不一致');
    const result = await api('/api/auth/' + (register ? 'register' : 'login'), 'POST', f);
    if (!admin) setPreferenceAccount(result.account);
    location.replace(destination);
  });
api('/api/auth/me')
  .then((me) => {
    if (me.account) {
      if (!admin) setPreferenceAccount(me.account);
      location.replace(destination);
    }
  })
  .catch(() => {});

if (!admin) import('./i18n.js').then(({ startI18n }) => startI18n()).catch(() => {});
