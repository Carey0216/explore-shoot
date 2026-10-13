import { createShellPages } from './pages/shell.js';
import { createDiscoverPages } from './pages/discover.js';
import { createPointsPages } from './pages/points.js';
import { createMapPages } from './pages/map.js';
import { createExplorationPages } from './pages/exploration.js';
import { createNotesPages } from './pages/notes.js';
import { createAccountPages } from './pages/account.js';
import { createPublishPages } from './pages/publish.js';
// 页面调度入口：启动、路由、共享状态和清理。具体页面在 pages/ 中。
import { mobileItems, outingTabs } from './outings.js';
import { mountCheckinPage } from './checkins.js';

import { startCommunityTranslation } from '/shared/community-translation.js';
import { startI18n } from '/shared/i18n.js';
import { setPreferenceAccount } from '/shared/preferences.js';
import { settingsHTML, bindSettings } from './settings.js';
startI18n();
startCommunityTranslation();

import { $, api, toast, modal, closeModal, photoPicker } from '/shared/ui.js';

import { stopNavigation } from '/shared/navigation.js';

import { journeyHTML, mountJourney } from './journey.js';

import {
  searchHTML,
  bindSearch,
  searchPoints,
  matchesText,
  bindLocalSearch,
  resetPageSearch,
} from './search.js';
import { localDraft, draftNotice, pruneDrafts } from '/shared/drafts.js';

function accountDraft(context) {
  return localDraft(state.account.id, context);
}
function draftPhoto(onSaved, context, { keepDraft = false, confirmedMediaId = null } = {}) {
  const draft = accountDraft(context);
  draft.reopen();
  return photoPicker(onSaved, {
    draft,
    notice: draftNotice(draft, { noun: '照片' }),
    keepDraft,
    confirmedMediaId,
  });
}
const state = {
  catalog: null,
  account: null,
  page: 'shots',
  theme: '全部',
  query: '',
  map: null,
  active: null,
  sessions: [],
  checkins: [],
  preferences: { budget: 20, people: 1, intensity: '轻松', theme: '全部', mode: 'fixed' },
};
const nav = mobileItems;
const cover = (p) =>
  p.cover ||
  '/shared/' +
    (p.id === 'nmu1'
      ? 'nmu-library.jpg'
      : p.theme === '建筑'
        ? 'nmu-building.jpg'
        : 'nmu-campus.jpg');
const status = (p) =>
  p.trust === 'certified'
    ? '<span class="pill green">已经过认证</span>'
    : p.trust === 'community'
      ? '<span class="pill orange">由社区共创者上传，请自行分辨</span>'
      : '<span class="pill">地图资料 · 待实地核验</span>';
const title = {
  shots: ['机位', '校园拍摄地点'],
  place: ['地点详情', ''],
  checkin: ['记录打卡', ''],
  passport: ['打卡足迹', '仅自己可见'],
  settings: ['设置', ''],
  search: ['搜索', '校园点位'],
  navigate: ['导航', ''],
  discover: ['发现', ''],
  map: ['地图', ''],
  routes: ['探索', ''],
  active: ['进行中的探索', ''],
  notes: ['探索手记', ''],
  me: ['我的', ''],
  publish: ['发布发现', ''],
};

window.addEventListener('navigation:destination', (e) => goNavigate(e.detail?.id));

let privateLoadRevision = 0;
async function loadPrivate() {
  const revision = ++privateLoadRevision,
    accountId = state.account?.id;
  if (state.account) {
    const library = await api('/api/my/library');
    if (revision !== privateLoadRevision || accountId !== state.account?.id) return;
    state.sessions = library.sessions;
    state.savedPoints = library.savedPoints;
    state.overview = library.overview;
    state.checkins = library.checkins;
    state.records = library.records;
    state.passport = { ...library.summary, ids: new Set(library.summary.ids) };
    state.active = state.sessions.find((s) => ['active', 'paused'].includes(s.status)) || null;
  } else {
    state.sessions = [];
    state.savedPoints = [];
    state.overview = { explorations: 0, bookmarks: 0 };
    state.checkins = [];
    state.records = [];
    state.passport = {
      visits: 0,
      unique: 0,
      current: 0,
      total: state.catalog.points.length,
      photos: 0,
      ids: new Set(),
    };
    state.active = null;
  }
  state.visitedIds = state.passport.ids;
}
async function render() {
  state.searchCleanup?.();
  state.searchCleanup = null;
  state.checkinCleanup?.();
  state.checkinCleanup = null;
  cancelMapLocate?.();
  state.settingsCleanup?.();
  state.settingsCleanup = null;
  state.taskDraftCleanups?.forEach((fn) => fn());
  state.taskDraftCleanups = [];
  state.publishBinding?.destroy();
  state.publishBinding = null;
  state.journey?.destroy();
  state.journey = null;
  state.map?.destroy();
  state.map = null;
  if (state.page !== 'active') {
    stopTracking();
    stopNavigation();
  }
  shell();
  if (['shots', 'place', 'checkin', 'passport'].includes(state.page)) {
    state.checkinCleanup = mountCheckinPage({
      state,
      cover,
      bindPoints,
      requireAccount,
      reload: loadPrivate,
      goNavigate,
      report: reportDialog,
      showMap: (id) => {
        state.focusPoint = id;
        state.theme = '全部';
        state.query = '';
        location.hash = 'map';
      },
    });
    return;
  }
  if (state.page === 'search') {
    if (!$('#campus-search-form')) $('#main').innerHTML = searchHTML(state.query);
    state.searchCleanup = bindSearch({
      query: state.query,
      setQuery: (q) => (state.query = q),
      points: state.catalog.points,
      card,
      bindCards: bindPoints,
      search: searchPoints,
      focus: state.focusSearch,
    });
    state.focusSearch = false;
    return;
  }
  if (state.page === 'navigate') {
    $('#main').innerHTML = outingTabs(state.page) + journeyHTML(state.catalog, state.navTarget);
    const el = $('#journey-map');
    try {
      const journey = await mountJourney(state.catalog);
      if (el.isConnected) state.journey = journey;
      else journey.destroy();
    } catch (e) {
      toast(e.message);
      const message = $('#journey-message');
      if (message) message.textContent = '地图加载失败，请刷新重试：' + e.message;
    }
    return;
  }
  let html = state.page === 'discover' ? discovery() : state.page === 'map' ? mapPage() : null;
  if (html) {
    $('#main').innerHTML = html;
    bindPoints();
    $('#map-open')?.addEventListener('click', () => (location.hash = 'map'));
    $('#clear-search')?.addEventListener('click', () => {
      state.query = '';
      render();
    });
    if (state.page === 'map') setupMap().catch((e) => toast(e.message));
    return;
  }
  await extraPage();
}
function readPageHash() {
  const raw = location.hash.slice(1),
    [path, query = ''] = raw.split('?'),
    [page, id] = path.split('/');
  state.page = page === 'explore' ? 'discover' : title[page] ? page : 'shots';
  state.placeId = id ? decodeURIComponent(id) : null;
  state.shotId = new URLSearchParams(query).get('shot');
}
window.addEventListener('hashchange', () => {
  if (!state.catalog) return;
  readPageHash();
  resetPageSearch(state, state.page);
  render().catch((e) => toast(e.message));
  window.scrollTo(0, 0);
});
function bindCollectionSearch(id, selector) {
  const form = $('#' + id);
  bindLocalSearch(
    form,
    (q) => {
      state.localQuery = q;
      let count = 0;
      document.querySelectorAll(selector).forEach((item) => {
        item.hidden = !matchesText(item.dataset.searchText || item.textContent, q);
        if (!item.hidden) count++;
      });
      const empty = $('#' + id + '-empty');
      if (empty) empty.hidden = count > 0 || !q;
    },
    state.localQuery,
  );
}

async function extraPage() {
  if (state.page === 'settings') {
    $('#main').innerHTML = settingsHTML(state.account);
    state.settingsCleanup = bindSettings({
      account: state.account,
      onSaved: async (a) => {
        state.account = a;
        setPreferenceAccount(a);
        state.catalog = await api('/api/catalog');
        await render();
      },
      onLogin: () => authDialog(),
      onLogout: async () => {
        stopTracking();
        stopNavigation();
        await api('/api/auth/logout', 'POST', {});
        state.account = null;
        setPreferenceAccount(null);
        await loadPrivate();
        await render();
        toast('已退出登录');
      },
    });
    return;
  }
  if (state.page === 'routes') return routePage();
  if (state.page === 'active') return activePage();
  if (state.page === 'me') return mePage();
  if (state.page === 'publish') return publishPage();
  if (state.page === 'notes') {
    $('#main').innerHTML = notesPage();
    bindCollectionSearch('notes-search', '.record');
    $('#gate-login')?.addEventListener('click', () => authDialog());
    document
      .querySelectorAll('[data-note]')
      .forEach(
        (b) => (b.onclick = () => noteDialog(state.sessions.find((s) => s.id === b.dataset.note))),
      );
    document.querySelectorAll('[data-delete-note]').forEach(
      (b) =>
        (b.onclick = () =>
          modal(
            '删除这篇手记？',
            '<p class="muted">该手记及其中的私人照片将从本地删除，无法恢复。已发布的社区点位照片会保留。</p><button class="button danger wide" id="confirm-delete">确认删除</button>',
            (d) => {
              $('#confirm-delete', d).onclick = async () => {
                try {
                  await api('/api/sessions/' + b.dataset.deleteNote, 'DELETE');
                  await loadPrivate();
                  closeModal();
                  render();
                  toast('手记已删除');
                } catch (e) {
                  toast(e.message);
                }
              };
            },
          )),
    );
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTracking();
    stopNavigation();
  } else if (state.page === 'active') activePage();
});
window.addEventListener('pagehide', () => {
  stopTracking();
  stopNavigation();
  state.journey?.destroy();
});
setInterval(async () => {
  try {
    if (document.hidden || !state.catalog) return;
    const latest = await api('/api/catalog');
    const changed = latest.version !== state.catalog.version;
    state.catalog = latest;
    if (state.account) {
      const accountId = state.account.id;
      const me = await api('/api/auth/me');
      if (state.account?.id !== accountId) return;
      if (!me.account) {
        closeModal();
        state.account = null;
        setPreferenceAccount(null);
        stopTracking();
        stopNavigation();
        await loadPrivate();
        render();
        return;
      }
      const scoutChange =
        me.account.scoutStatus !== state.account.scoutStatus ||
        me.account.nickname !== state.account.nickname ||
        me.account.avatarVersion !== state.account.avatarVersion;
      state.account = me.account;
      setPreferenceAccount(me.account);
      if (state.page === 'navigate') {
        state.journey?.refresh(latest);
        return;
      }
      if (state.page === 'active') await loadPrivate();
      if (changed || scoutChange) {
        if (!$('#publish-form') && !$('#dialog')) render();
      } else if (state.page === 'active' && state.active?.blocked?.length && !$('#dialog')) {
        stopTracking();
        stopNavigation();
        render();
      }
    } else if (state.page === 'navigate') state.journey?.refresh(latest);
    else if (changed && !$('#dialog')) render();
  } catch {}
}, 12000);
window.addEventListener('preferences:unauthorized', async () => {
  state.account = null;
  setPreferenceAccount(null);
  stopTracking();
  stopNavigation();
  await loadPrivate();
  render();
});
const { shell, openSearch, heading } = createShellPages({
  state: state,
  nav: nav,
  authDialog: (...args) => authDialog(...args),
  render: (...args) => render(...args),
  title: title,
});
const { filtered, chips, card, discovery } = createDiscoverPages({
  state: state,
  cover: (...args) => cover(...args),
  heading: (...args) => heading(...args),
});
const { goNavigate, bindPoints, bookmark, pointDialog, reportDialog } = createPointsPages({
  loadPrivate: (...args) => loadPrivate(...args),
  state: state,
  render: (...args) => render(...args),
  requireAccount: (...args) => requireAccount(...args),
  accountDraft: (...args) => accountDraft(...args),
});
const { mapPage, setupMap, locate, cancelMapLocate } = createMapPages({
  heading: (...args) => heading(...args),
  filtered: (...args) => filtered(...args),
  chips: (...args) => chips(...args),
  state: state,
  cover: (...args) => cover(...args),
  status: (...args) => status(...args),
  bindPoints: (...args) => bindPoints(...args),
  reportDialog: (...args) => reportDialog(...args),
});
const {
  preferenceGroup,
  routePage,
  routePreview,
  stopTracking,
  startTracking,
  sessionAction,
  skipDialog,
  activePage,
  decoratePhotoDrafts,
} = createExplorationPages({
  state: state,
  heading: (...args) => heading(...args),
  cover: (...args) => cover(...args),
  bindCollectionSearch: (...args) => bindCollectionSearch(...args),
  requireAccount: (...args) => requireAccount(...args),
  pointDialog: (...args) => pointDialog(...args),
  status: (...args) => status(...args),
  locate: (...args) => locate(...args),
  loadPrivate: (...args) => loadPrivate(...args),
  accountDraft: (...args) => accountDraft(...args),
  title: title,
  bindPoints: (...args) => bindPoints(...args),
  draftPhoto: (...args) => draftPhoto(...args),
});
const { noteDialog, notesPage } = createNotesPages({
  status: (...args) => status(...args),
  title: title,
  state: state,
  accountDraft: (...args) => accountDraft(...args),
  loadPrivate: (...args) => loadPrivate(...args),
  loginGate: (...args) => loginGate(...args),
  heading: (...args) => heading(...args),
});
const { authDialog, requireAccount, loginGate, mePage, applyScout } = createAccountPages({
  stopTracking: (...args) => stopTracking(...args),
  state: state,
  heading: (...args) => heading(...args),
  card: (...args) => card(...args),
  status: (...args) => status(...args),
  bindCollectionSearch: (...args) => bindCollectionSearch(...args),
  bindPoints: (...args) => bindPoints(...args),
  render: (...args) => render(...args),
  loadPrivate: (...args) => loadPrivate(...args),
  accountDraft: (...args) => accountDraft(...args),
});
const { publishPage } = createPublishPages({
  state: state,
  loginGate: (...args) => loginGate(...args),
  authDialog: (...args) => authDialog(...args),
  heading: (...args) => heading(...args),
  applyScout: (...args) => applyScout(...args),
  accountDraft: (...args) => accountDraft(...args),
  draftPhoto: (...args) => draftPhoto(...args),
  pointDialog: (...args) => pointDialog(...args),
});
async function boot() {
  pruneDrafts();
  try {
    try {
      const p = JSON.parse(sessionStorage.getItem('campus-preferences'));
      if (
        p &&
        [15, 20, 30].includes(p.budget) &&
        [1, 2].includes(p.people) &&
        ['轻松', '适中'].includes(p.intensity) &&
        ['全部', '建筑', '自然', '人文', '运动'].includes(p.theme) &&
        ['fixed', 'guide', 'personal'].includes(p.mode)
      )
        state.preferences = p;
    } catch {}
    const [catalog, me] = await Promise.all([api('/api/catalog'), api('/api/auth/me')]);
    state.catalog = catalog;
    state.account = me.account;
    setPreferenceAccount(me.account);
    await loadPrivate();
    readPageHash();
    await render();
    window.campusStartup?.ready();
  } catch (e) {
    window.campusStartup?.fail(e.message);
  }
}
boot();
