import { setPreferenceAccount } from '/shared/preferences.js';
import { onboardingEntry, bindOnboardingEntry } from '../onboarding.js';
import { settingsEntry } from '../settings.js';
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
import { localSearchHTML } from '../search.js';
import { bindDraftForm } from '/shared/drafts.js';

// 登录入口、我的与探索官申请。业务规则与权限由 Java 接口处理。
export function createAccountPages({
  stopTracking,
  stopNavigation = () => {},
  state,
  heading,
  card,
  status,
  bindCollectionSearch,
  bindPoints,
  render,
  loadPrivate,
  accountDraft,
}) {
  function authDialog(tab = 'login') {
    closeModal();
    stopTracking();
    stopNavigation();
    try {
      sessionStorage.setItem('campus-preferences', JSON.stringify(state.preferences));
    } catch {}
    location.assign(authURL('user', tab, '/' + location.hash));
  }

  async function requireAccount() {
    if (state.account) return true;
    authDialog();
    return false;
  }

  function loginGate(h, p, withHeading = true) {
    return `${withHeading ? heading() : ''}<div class="empty"><h2>${h}</h2><p>${p}</p><button class="button" id="gate-login">登录 / 注册</button></div>`;
  }

  async function mePage() {
    const a = state.account;
    if (!a) {
      $('#main').innerHTML =
        heading() +
        onboardingEntry() +
        settingsEntry() +
        loginGate('加入你的校园探索圈', '注册后可收藏点位和记录打卡，也可申请校园探索官。', false);
      bindOnboardingEntry(state.account);
      $('#gate-login').onclick = () => authDialog();
      return;
    }
    await loadPrivate();
    if (state.page !== 'me' || state.account?.id !== a.id) return;
    const tab = state.myTab || 'saved',
      query = state.myQuery || '';
    const key = JSON.stringify([a.id, tab, query]);
    state.myLists ||= new Map();
    let content = state.myLists.get(key);
    if (!content) {
      content = await api(
        '/api/my/content?tab=' + tab + '&query=' + encodeURIComponent(query) + '&page=1',
      );
      if (state.page !== 'me' || state.account?.id !== a.id) return;
      state.myLists.set(key, content);
    }
    const items = content.points || content.items;
    $('#main').innerHTML =
      `${heading()}${onboardingEntry()}<nav class="personal-shortcuts" aria-label="我的工具">${[
        ['guides', 'book', '拍摄指南', ''],
        ['passport', 'check', '校园护照', ''],
        ['plans', 'camera', '拍摄清单', 'plans'],
        ['collections', 'heart', '收藏分组', 'plans'],
        ['notes', 'book', '探索手记', ''],
        ['my-works', 'discover', '公开作品', ''],
        ['contact', 'message', '联系管理员', 'messages'],
        ['settings', 'settings', '账户设置', ''],
      ]
        .map(
          ([path, glyph, label, feature]) =>
            `<a href="#${path}" ${feature ? `data-feature="${feature}"` : ''}><span class="shortcut-icon">${icon(glyph)}</span><span>${label}</span></a>`,
        )
        .join('')}</nav>
    ${a.scoutStatus !== 'approved' ? `<div class="scout-entry"><span>${a.scoutStatus === 'pending' ? '探索官申请审核中' : '一起分享校园的新发现'}</span>${a.scoutStatus !== 'pending' ? '<button class="text-btn" id="apply-scout">申请探索官 ↗</button>' : ''}</div>` : ''}
    <section class="personal-content"><nav class="content-tabs" role="tablist" aria-label="我的内容">${Object.entries(
      { saved: '收藏', posts: '社区发现', reports: '问题反馈' },
    )
      .map(
        ([id, label]) =>
          `<button role="tab" aria-selected="${id === tab}" aria-controls="personal-items" id="my-tab-${id}" data-my-tab="${id}" class="${id === tab ? 'active' : ''}">${label}</button>`,
      )
      .join('')}</nav>
    <form class="personal-search" id="my-filter"><label class="sr-only" for="my-query">搜索当前分类</label><input id="my-query" type="search" maxlength="100" placeholder="搜索${{ saved: '收藏', posts: '我的发现', reports: '反馈' }[tab]}" value="${esc(query)}"><button class="icon-btn" aria-label="搜索">${icon('search')}</button></form><p class="muted">共 ${content.total} 条</p>
    <div id="personal-items" role="tabpanel" aria-labelledby="my-tab-${tab}" class="${tab === 'reports' ? 'stack' : 'feed-grid'}">${tab === 'reports' ? items.map((r) => `<article class="personal-report"><small>${date(r.createdAt)}</small><h3>${esc(r.category || '点位反馈')}</h3><p>${esc(r.description)}</p><span class="pill">${r.status === 'pending' ? '处理中' : r.status === 'resolved' ? '已处理' : '未采纳'}</span>${r.note ? `<p class="admin-reply">管理员：${esc(r.note)}</p>` : ''}</article>`).join('') : items.map(card).join('')}</div>${!items.length ? '<p class="empty">这里暂时没有内容。</p>' : ''}${content.hasMore ? '<button class="button secondary wide" id="my-more">加载更多</button>' : ''}</section>`;
    document.querySelectorAll('[data-my-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          state.myQueries ||= {};
          state.myQueries[state.myTab || 'saved'] = state.myQuery || '';
          state.myTab = b.dataset.myTab;
          state.myQuery = state.myQueries[state.myTab] || '';
          render();
        }),
    );
    $('#my-filter').onsubmit = (e) => {
      e.preventDefault();
      state.myQuery = $('#my-query').value.trim();
      render();
    };
    $('#my-more')?.addEventListener('click', async function () {
      this.disabled = true;
      try {
        const more = await api(
          '/api/my/content?tab=' +
            tab +
            '&query=' +
            encodeURIComponent(query) +
            '&page=' +
            (content.page + 1),
        );
        const field = tab === 'saved' ? 'points' : 'items';
        state.myLists.set(key, { ...more, [field]: [...items, ...more[field]] });
        if (state.page === 'me' && (state.myTab || 'saved') === tab) await render();
      } catch (error) {
        toast(error.message);
      } finally {
        this.disabled = false;
      }
    });
    bindOnboardingEntry(a);
    bindPoints();
    $('#apply-scout')?.addEventListener('click', applyScout);
  }

  function applyScout() {
    modal(
      '申请成为校园探索官',
      `<p class="muted">一起找到更多校园角落。申请通过后，可发布新点位和提交现场问题反馈。</p><form id="scout-form"><label>想分享什么样的校园发现？<textarea name="reason" required minlength="5" maxlength="1000" placeholder="简单介绍你的兴趣和想贡献的内容…"></textarea></label>${errorHTML}<button class="button wide" type="submit">提交申请</button></form>`,
      (d) => {
        const draft = bindDraftForm($('#scout-form', d), accountDraft('scout'), ['reason']);
        $('#scout-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/scout/apply', 'POST', f);
            await draft.clear().catch(() => {});
            state.account.scoutStatus = 'pending';
            closeModal();
            toast('申请已提交，请等待管理员审核');
            render();
          });
        return () => draft.destroy();
      },
    );
  }
  return { authDialog, requireAccount, loginGate, mePage, applyScout };
}
