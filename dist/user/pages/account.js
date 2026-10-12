import { setPreferenceAccount } from '/shared/preferences.js';
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
import { stopNavigation } from '/shared/navigation.js';
import { authURL } from '/shared/auth-routing.js';
import { avatarHTML, profileDialog } from '/shared/profile.js';
import { localSearchHTML } from '../search.js';
import { bindDraftForm } from '/shared/drafts.js';

// 登录入口、我的与探索官申请。业务规则与权限由 Java 接口处理。
export function createAccountPages({
  stopTracking,
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
    return `${withHeading ? heading() : ''}<div class="empty"><h2>${h}</h2><p>${p}</p><button class="button" id="gate-login">登录 / 邀请码注册</button></div>`;
  }

  async function mePage() {
    const a = state.account;
    if (!a) {
      $('#main').innerHTML =
        heading() +
        settingsEntry() +
        loginGate(
          '加入你的校园探索圈',
          '用管理员提供的邀请码注册，收藏点位、记录旅途和参与共创。',
          false,
        );
      $('#gate-login').onclick = () => authDialog();
      return;
    }
    await loadPrivate();
    const community = await api('/api/my/community');
    if (state.page !== 'me' || state.account?.id !== a.id) return;
    const statusText = {
      none: '等待你的第一份发现',
      pending: '申请已送达 · 等待管理员确认',
      approved: '你已经是校园探索官',
      rejected: '申请暂未通过 · 可以补充理由重新申请',
    }[a.scoutStatus];
    $('#main').innerHTML =
      `${heading()}${settingsEntry()}<a class="button secondary" style="margin-bottom:24px" href="#passport">${icon('check')} 我的打卡足迹</a><div class="account-panel"><section class="profile"><div class="profile-avatar">${avatarHTML(a)}</div><div><h2>${esc(a.nickname)}</h2><p>@${esc(a.username)} · ${a.scoutStatus === 'approved' ? '校园探索官' : '校园探索者'}</p></div><div class="profile-actions"><button class="button secondary small" id="edit-profile">编辑个人资料</button><button class="button secondary small" id="change-password">修改密码</button><button class="text-btn" id="user-logout">退出登录</button></div></section><div class="account-grid"><section class="account-tile"><h3>${icon('camera')} 校园探索官</h3><p>${statusText}</p><p>分享新点位，帮助大家发现校园；提交现场问题，一起维护可信的信息。</p>${a.scoutStatus === 'approved' ? '<a class="button small" href="#publish">发布一个新发现</a>' : a.scoutStatus === 'pending' ? '<span class="pill">审核中</span>' : '<button class="button small" id="apply-scout">申请成为探索官</button>'}${community.applications.at(-1)?.note ? `<p class="muted">管理员回复：${esc(community.applications.at(-1).note)}</p>` : ''}</section><section class="account-tile"><h3>${icon('book')} 我的探索手记</h3><p>已留下 ${state.overview.explorations} 段探索记录<br>照片和实时轨迹仅自己可见。</p><a class="button secondary small" href="#notes">翻开手记</a></section></div>${localSearchHTML('me-search', '搜索我的收藏与社区发现', state.localQuery)}<p id="me-search-empty" class="page-filter-empty" hidden>没有匹配的收藏或发现。</p><h3 style="margin-bottom:20px">我的收藏 <span class="muted">${state.overview.bookmarks}</span></h3><div class="feed-grid">${state.savedPoints.map(card).join('')}</div>${!a.bookmarks?.length ? '<p class="muted">在喜欢的点位旁点一下爱心，就能在这里找到。</p>' : ''}<h3 style="margin:32px 0 18px">我的社区发现</h3><div class="stack">${community.points.map((p) => `<div class="record"><div><h3>${esc(p.name)}</h3><p>${p.published ? '已发布' : '已下线'} · ${date(p.createdAt)}</p></div>${status(p)}</div>`).join('') || '<p class="muted">还没有发布点位。校园的下一个好角度，等你来分享。</p>'}</div>${community.reports.length ? '<h3 style="margin-top:28px">我的问题反馈</h3>' + community.reports.map((r) => `<div class="detail-info"><b>${esc(state.catalog.points.find((p) => p.id === r.pointId)?.name || '点位反馈')}</b>${esc(r.description)}<p class="muted">${r.status === 'pending' ? '管理员处理中' : r.status === 'resolved' ? '已处理' : '未采纳'}${r.note ? ' · ' + esc(r.note) : ''}</p></div>`).join('') : ''}</div>`;
    bindCollectionSearch('me-search', '.point-card,.record');
    bindPoints();
    $('#edit-profile').onclick = () =>
      profileDialog(state.account, async (a) => {
        state.account = a;
        setPreferenceAccount(a);
        state.catalog = await api('/api/catalog');
        await render();
      });
    $('#change-password').onclick = passwordDialog;
    $('#user-logout').onclick = async () => {
      stopTracking();
      stopNavigation();
      await api('/api/auth/logout', 'POST', {});
      state.account = null;
      setPreferenceAccount(null);
      await loadPrivate();
      render();
      toast('已退出登录');
    };
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
