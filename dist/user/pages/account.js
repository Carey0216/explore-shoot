import { emptyContent73 } from '/shared/content73.js';
import { badgeURL } from '/shared/badge-presets.js';
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
    const passportPreview = await api('/api/my/passport').catch(() => null);
    const recent = (
      (await api('/api/my/records?page=1').catch(() => ({ items: [] }))).items || []
    ).slice(0, 1);
    if (state.page !== 'me' || state.account?.id !== a.id) return;
    const emptyCopy = emptyContent73[tab] || emptyContent73.saved;
    const tools = [
      ['plans', 'camera', '拍摄清单', 'plans'],
      ['collections', 'heart', '收藏分组', 'plans'],
      ['notes', 'book', '探索手记', ''],
      ['my-works', 'discover', '公开作品', 'work-wall'],
    ];
    const toolHTML = (items) =>
      items
        .map(
          ([path, glyph, label, feature]) =>
            `<a data-no-liquid href="#${path}" ${feature ? `data-feature="${feature}"` : ''}>${icon(glyph)}<span>${label}</span>${icon('arrow')}</a>`,
        )
        .join('');

    $('#main').innerHTML =
      `${heading()}<section class="identity73">${avatarHTML(a, 'large')}<div><h2>${esc(a.nickname || a.username)}</h2><p>${a.scoutStatus === 'approved' ? '校园探索官' : '校园探索者'} · ${esc(state.catalog.campus.name || '北方民族大学')}</p></div><a class="icon-btn" href="#settings" aria-label="账户设置">${icon('settings')}</a></section><section class="passport-preview73" data-feature="passport"><a data-no-liquid href="#passport"><div class="section-title73"><h2>我的校园护照</h2>${icon('book')}</div><p>把走过的地方，收进自己的校园。</p><div class="preview-stamps73">${(
        passportPreview?.achievements || []
      )
        .slice(0, 3)
        .map(
          (x) =>
            `<img class="${x.earned ? '' : 'locked'}" src="${badgeURL(x.badgePreset)}" alt="${esc(x.title)} · ${x.earned ? '已获得' : '未获得'}">`,
        )
        .join(
          '',
        )}</div><div class="section-title73"><small>${Number(state.passport?.unique || 0)} 个地点 · ${(passportPreview?.achievements || []).filter((x) => x.earned).length} 枚印章</small><span>翻开看看 ↗</span></div></a></section><section class="recent-preview73"><div class="section-title73"><h2>最近的探索</h2><a class="text-btn" href="#passport">全部 ${icon('arrow')}</a></div>${state.active ? `<h3>${esc(state.active.routeName)}</h3><a class="text-btn" href="#active">继续这段探索 ${icon('arrow')}</a>` : recent.length ? recent.map((r) => `<div class="recent-record73">${r.mediaId ? `<a href="/media/${esc(r.mediaId)}" aria-label="查看最近的探索照片"><img src="/media/${esc(r.mediaId)}?size=thumb" alt="我的探索照片"></a>` : ''}<div><h3>${esc(r.pointName || '校园探索')}</h3><p class="muted">${date(r.createdAt)}</p><a class="text-btn" href="#passport">回看探索记录 ${icon('arrow')}</a></div></div>`).join('') : '<p class="muted">从一个校园角落开始，留下第一张自己的记录。</p><a class="text-btn" href="#discover">去发现一处想拍的地方 ↗</a>'}</section><section class="personal-toolbox73"><h2>常用工具</h2><nav class="tool-rows73" aria-label="常用工具">${toolHTML(tools)}</nav><details><summary>更多工具与帮助</summary><nav class="tool-rows73" aria-label="更多工具">${toolHTML(
        [
          ['guides', 'book', '拍摄指南', 'exploration'],
          ['contact', 'message', '联系管理员', 'messages'],
          ['settings', 'settings', '账户设置', ''],
        ],
      )}</nav>${onboardingEntry()}</details></section>

    ${a.scoutStatus !== 'approved' ? `<div class="scout-entry"><span>${a.scoutStatus === 'pending' ? '探索官申请审核中' : '一起分享校园的新发现'}</span>${a.scoutStatus !== 'pending' ? '<button class="text-btn" id="quiz-scout">答题成为探索官 ↗</button><button class="text-btn" id="apply-scout">向管理员申请 ↗</button>' : ''}</div>` : ''}
    <section class="personal-content"><nav class="content-tabs" role="tablist" aria-label="我的内容">${Object.entries(
      { saved: '收藏', posts: '社区发现', reports: '问题反馈' },
    )
      .map(
        ([id, label]) =>
          `<button role="tab" aria-selected="${id === tab}" aria-controls="personal-items" id="my-tab-${id}" data-my-tab="${id}" class="${id === tab ? 'active' : ''}">${label}</button>`,
      )
      .join('')}</nav>
    <form class="personal-search" id="my-filter"><label class="sr-only" for="my-query">搜索当前分类</label><input id="my-query" type="search" maxlength="100" placeholder="搜索${{ saved: '收藏', posts: '我的发现', reports: '反馈' }[tab]}" value="${esc(query)}"><button class="icon-btn" aria-label="搜索">${icon('search')}</button></form><p class="muted">共 ${content.total} 条</p>
    <div id="personal-items" role="tabpanel" aria-labelledby="my-tab-${tab}" class="${tab === 'reports' ? 'stack' : 'feed-grid'}">${tab === 'reports' ? items.map((r) => `<article class="personal-report"><small>${date(r.createdAt)}</small><h3>${esc(r.category || '点位反馈')}</h3><p>${esc(r.description)}</p><span class="pill">${r.status === 'pending' ? '处理中' : r.status === 'resolved' ? '已处理' : '未采纳'}</span>${r.note ? `<p class="admin-reply">管理员：${esc(r.note)}</p>` : ''}</article>`).join('') : items.map(card).join('')}</div>${!items.length ? `<section class="context-empty73"><h3>${emptyCopy[0]}</h3><p>${emptyCopy[1]}</p><a class="button secondary" href="${emptyCopy[3]}">${emptyCopy[2]} ${icon('arrow')}</a></section>` : ''}${content.hasMore ? '<button class="button secondary wide" id="my-more">加载更多</button>' : ''}</section>`;
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
    $('#quiz-scout')?.addEventListener('click', () => {
      import('../scout.js').then((m) => m.publishEntry({ state, authDialog, render }));
    });
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
