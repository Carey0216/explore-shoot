import { installPhotoViewer } from '/shared/photo-viewer.js';
import { mountCollectionEntries } from './collection-preview.js';
installPhotoViewer();
import { installActivityJourney } from './activity-journey.js';
import { installCelebrations } from '/shared/celebrations.js';
import { installImageRecovery } from '/shared/image-loading.js';
installImageRecovery();
import { mountGuides } from './guides.js';
import { mountUpdates } from './updates.js';
import { showOnboarding } from './onboarding.js';
import {
  installContextBack,
  rememberList,
  restoreList,
  restoreState,
  clearListState,
} from './context-back.js';
installContextBack();
import { installSupport } from './support-chat.js';
import { installWeatherWhisper } from './photo-timing.js';
import { installTaskFlow } from './task-flow.js';
import { mountMessages } from './messages.js';
import { mountPublicContent } from '/shared/site-content.js';
import { startDisplayPreferences } from '/shared/display-preferences.js';
import { bindPointReactions } from '/shared/point-reactions.js';
import { createShellPages } from './pages/shell.js';
import { createPointsPages } from './pages/points.js';
import { createAccountPages } from './pages/account.js';
// 页面调度入口：启动、路由、共享状态和清理。具体页面在 pages/ 中。
import { mobileItems, outingTabs, communityTabs } from './outings.js';
let mountCheckinPage, mountShootingPage, mountPhotography;
import {
  loadFeatures,
  applyFeatureEntries,
  featureVisible,
  featureOn,
  featureForRoute,
  maintenanceMessage,
} from '/shared/features.js';
void loadFeatures().then(() => {
  applyFeatureEntries();
  installSupport();
  installWeatherWhisper();
  if (featureOn('offline') && featureVisible('offline') && 'serviceWorker' in navigator)
    navigator.serviceWorker.register('/offline-worker.js').catch(() => {});
});
new MutationObserver(() => applyFeatureEntries()).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

import { setPreferenceAccount } from '/shared/preferences.js';
import { settingsHTML, bindSettings } from './settings.js';

import { $, api, toast, modal, closeModal, photoPicker } from '/shared/ui.js';

let navigationModule;
const stopNavigation = () => navigationModule?.stopNavigation();

let journeyHTML, mountJourney;

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
  page: 'discover',
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
  updates: ['版本更新', ''],
  guides: ['校园拍摄指南', ''],
  guide: ['拍摄指南', ''],
  plans: ['拍摄清单', '仅自己可见'],
  memories: ['校园回忆册', '仅自己可见'],
  collections: ['收藏分组', '仅自己可见'],
  'shared-plan': ['分享的拍摄计划', ''],
  topics: ['季节与活动专题', ''],
  support: ['AI客服', ''],
  spot: ['独立机位详情', ''],
  notifications: ['站内通知', ''],
  'my-works': ['我的公开作品', ''],
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
  contact: ['联系管理员', ''],
  conversation: ['与管理员对话', ''],
  notice: ['通知详情', ''],
  topic: ['活动专题', ''],
};

window.addEventListener('navigation:destination', (e) => goNavigate(e.detail?.id));

let privateLoadRevision = 0;
async function loadPrivate(full = false) {
  const revision = ++privateLoadRevision,
    accountId = state.account?.id;
  if (state.account) {
    const library = await api('/api/my/library' + (full ? '' : '?compact=1'));
    if (revision !== privateLoadRevision || accountId !== state.account?.id) return;
    state.sessions = library.sessions;
    state.savedPoints = library.savedPoints;
    state.overview = library.overview;
    state.checkins = library.checkins;
    state.records = library.records;
    state.passport = { ...library.summary, ids: new Set(library.summary.ids) };
    state.active = state.sessions.find((s) => ['active', 'paused'].includes(s.status)) || null;
  } else {
    state.myLists?.clear();
    clearListState();
    state.mapCamera = null;
    state.notePage = 1;
    state.noteQuery = '';
    state.noteResult = null;
    state.recordPage = 1;
    state.recordResult = null;
    state.myQueries = {};
    state.myQuery = '';
    state.searchSnapshot = null;
    state.shotList = null;
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
  try {
    return await renderPage();
  } finally {
    document.querySelector('.community-tabs')?.remove();
    const tabs = communityTabs(state.page);
    if (tabs) $('#main').insertAdjacentHTML('afterbegin', tabs);
    restoreList(location.hash);
    document.dispatchEvent(new CustomEvent('campus:page-ready'));
    void mountCollectionEntries(state);
    if (state.catalog)
      void mountPublicContent(() => ({ page: state.page, account: state.account }));
  }
}
async function renderPage() {
  const revision = ++renderRevision,
    page = state.page;
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
  const gated = featureForRoute(page);
  if (gated && (!featureOn(gated) || !featureVisible(gated))) {
    $('#main').innerHTML =
      '<section class="empty" role="status">' + maintenanceMessage + '</section>';
    applyFeatureEntries();
    return;
  }
  const loading = ensurePage(page);
  $('#main').setAttribute('aria-busy', 'true');
  if (!$('#main').children.length)
    $('#main').innerHTML = '<p class="page-loading" role="status">正在加载页面…</p>';
  try {
    await loading;
  } catch (e) {
    console.warn('Page module unavailable:', e.message);
    if (revision === renderRevision) {
      $('#main').removeAttribute('aria-busy');
      $('#main').innerHTML =
        '<p class="page-loading" role="alert">页面暂时无法加载，请检查网络后重试。</p><button class="button secondary" id="page-retry">重试</button>';
      $('#page-retry').onclick = () => render().catch((e) => toast(e.message));
    }
    return;
  }
  if (revision !== renderRevision || page !== state.page) return;
  if (
    ![
      'discover',
      'updates',
      'guides',
      'guide',
      'map',
      'notes',
      'passport',
      'shots',
      'me',
      'search',
      'settings',
      'support',
      'notifications',
      'notice',
      'contact',
      'conversation',
    ].includes(page) &&
    state.catalog.complete === false
  ) {
    state.catalog = await api('/api/catalog');
    if (revision !== renderRevision || page !== state.page) return;
  }
  if (['active', 'my-works'].includes(page)) await loadPrivate(true);
  if (page === 'passport' && state.account) {
    const data = await api('/api/my/records?page=' + (state.recordPage || 1));
    if (revision !== renderRevision || page !== state.page) return;
    state.records = data.items;
    state.recordResult = data;
    state.passport = { ...data.summary, ids: new Set(data.summary.ids) };
  }
  if (page === 'notes' && state.account) {
    const data = await api(
      '/api/my/notes?page=' +
        (state.notePage || 1) +
        '&query=' +
        encodeURIComponent(state.noteQuery || ''),
    );
    if (revision !== renderRevision || page !== state.page) return;
    state.sessions = data.items;
    state.noteResult = data;
  }
  if (page === 'updates') {
    await mountUpdates($('#main'), () => revision === renderRevision && page === state.page);
    return;
  }
  if (page === 'memories') {
    const { mountMemories } = await import('./memories.js');
    if (revision === renderRevision && page === state.page)
      state.checkinCleanup = mountMemories({ root: $('#main'), state, requireAccount });
    return;
  }
  if (['guides', 'guide'].includes(page)) {
    await mountGuides({
      root: $('#main'),
      state,
      alive: () => revision === renderRevision && page === state.page,
    });
    return;
  }
  $('#main').removeAttribute('aria-busy');
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
  if (['plans', 'topics', 'topic', 'collections', 'shared-plan'].includes(state.page)) {
    state.checkinCleanup = mountPhotography({ state, requireAccount });
    return;
  }
  if (['contact', 'conversation', 'notice'].includes(state.page)) {
    state.checkinCleanup = mountMessages({ state, requireAccount });
    return;
  }
  if (state.page === 'support') {
    $('#main').innerHTML = '<h1>校园助手</h1><p>从右下角继续与助手对话。</p>';
    window.dispatchEvent(new Event('support:open'));
    return;
  }
  if (['spot', 'notifications', 'my-works'].includes(state.page)) {
    state.checkinCleanup = mountShootingPage({ state, requireAccount });
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
      snapshot: state.searchSnapshot,
      remember: (snapshot) => {
        state.searchSnapshot = snapshot;
      },
      focus: state.focusSearch,
    });
    state.focusSearch = false;
    return;
  }
  if (state.page === 'navigate') {
    const navigationCatalog = state.navPlace
      ? {
          ...state.catalog,
          points: [
            ...state.catalog.points.filter((p) => p.id !== state.navPlace.id),
            state.navPlace,
          ],
        }
      : state.catalog;
    $('#main').innerHTML = outingTabs(state.page) + journeyHTML(navigationCatalog, state.navTarget);
    const el = $('#journey-map');
    try {
      const journey = await mountJourney(navigationCatalog);
      if (el.isConnected) state.journey = journey;
      else journey.destroy();
    } catch (e) {
      toast(e.message);
      const message = $('#journey-message');
      if (message) message.textContent = '地图加载失败，请刷新重试：' + e.message;
    }
    return;
  }
  let html =
    state.page === 'discover' ? await discovery() : state.page === 'map' ? mapPage() : null;
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
  state.page = ['explore', 'community'].includes(page)
    ? 'discover'
    : title[page]
      ? page
      : 'discover';
  state.placeId = id ? decodeURIComponent(id) : null;
  state.shotId = new URLSearchParams(query).get('shot');
  state.spotId = new URLSearchParams(query).get('spot');
}
installActivityJourney(() => ({ account: state.account }));
installCelebrations(() => ({ page: state.page, account: state.account, ready: !!state.catalog }), {
  admin: false,
});
window.addEventListener('hashchange', () => {
  if (!state.catalog) return;
  rememberList(state);
  readPageHash();
  resetPageSearch(state, state.page);
  restoreState(state);
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
        state.catalog = await api('/api/catalog?compact=1');
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
    if ($('#notes-search'))
      $('#notes-search').onsubmit = (e) => {
        e.preventDefault();
        state.noteQuery = $('#notes-search input').value.trim();
        state.notePage = 1;
        void render();
      };
    document.querySelectorAll('[data-note-page]').forEach(
      (b) =>
        (b.onclick = () => {
          state.notePage = Number(b.dataset.notePage);
          void render();
        }),
    );
    $('#gate-login')?.addEventListener('click', () => authDialog());
    document.querySelectorAll('[data-note]').forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            const s = await api('/api/sessions/' + b.dataset.note);
            if (state.page === 'notes') noteDialog(s.session || s);
          } catch (e) {
            toast(e.message);
          } finally {
            b.disabled = false;
          }
        }),
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
window.addEventListener('account:logged-out', async () => {
  stopTracking();
  stopNavigation();
  state.account = null;
  setPreferenceAccount(null);
  await loadPrivate();
  await render();
  toast('已退出登录');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTracking();
    stopNavigation();
  } else if (state.page === 'active') activePage?.();
});
window.addEventListener('pagehide', () => {
  stopTracking();
  stopNavigation();
  state.journey?.destroy();
});
setInterval(async () => {
  try {
    if (document.hidden || !state.catalog) return;
    const latest = await api('/api/catalog?compact=1');
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
      const previousUnread = state.unreadNotifications;
      state.unreadNotifications = me.account
        ? (
            await api('/api/notifications/summary').catch(() => ({
              unread: me.unreadNotifications || 0,
              badge: me.unreadNotifications || 0,
            }))
          ).badge
        : 0;
      const noticeChange = previousUnread !== state.unreadNotifications;
      document.querySelectorAll('[data-notification-count]').forEach((el) => {
        el.textContent = state.unreadNotifications ? String(state.unreadNotifications) : '';
        el.hidden = !state.unreadNotifications;
      });
      const savedChange =
        JSON.stringify(state.account?.bookmarks) !== JSON.stringify(me.account?.bookmarks);
      if (savedChange) {
        state.myLists?.clear();
        state.shotList = null;
      }
      state.account = me.account;
      setPreferenceAccount(me.account);
      if (state.page === 'navigate') {
        state.journey?.refresh(latest);
        return;
      }
      if (state.page === 'active') await loadPrivate();
      if ((changed || scoutChange || savedChange) && state.page !== 'notifications') {
        if (
          !$('#publish-form') &&
          !$('#checkin-form') &&
          !$('#reply-form') &&
          !$('#contact-request') &&
          !$('#dialog') &&
          !$('#my-query')?.matches(':focus')
        )
          render();
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
let filtered, chips, card, discovery;
function loadDiscoverPage() {
  return oncePage('discover', async () => {
    const { createDiscoverPages } = await import('./pages/discover.js');
    ({ filtered, chips, card, discovery } = createDiscoverPages({
      state: state,
      cover: (...args) => cover(...args),
      heading: (...args) => heading(...args),
    }));
  });
}
const { goNavigate, bindPoints, bookmark, pointDialog, reportDialog } = createPointsPages({
  loadPrivate: (...args) => loadPrivate(...args),
  state: state,
  render: (...args) => render(...args),
  requireAccount: (...args) => requireAccount(...args),
  accountDraft: (...args) => accountDraft(...args),
});
installTaskFlow(() => state, {
  navigate: goNavigate,
  framing: async (spot) => {
    const { openFraming } = await import('./framing.js');
    state.framingCleanup?.();
    state.framingCleanup = openFraming(spot);
  },
});
let mapPage, setupMap, locate, cancelMapLocate;
let preferenceGroup,
  routePage,
  routePreview,
  startTracking,
  sessionAction,
  skipDialog,
  activePage,
  decoratePhotoDrafts;
let stopTracking = () => {};
let noteDialog, notesPage, publishPage;
const pageLoads = new Map();
function oncePage(key, work) {
  if (!pageLoads.has(key))
    pageLoads.set(
      key,
      work().catch((e) => {
        pageLoads.delete(key);
        throw e;
      }),
    );
  return pageLoads.get(key);
}
function loadMapPage() {
  return oncePage('map', async () => {
    await loadDiscoverPage();
    const { createMapPages } = await import('./pages/map.js');
    ({ mapPage, setupMap, locate, cancelMapLocate } = createMapPages({
      heading: (...args) => heading(...args),
      filtered: (...args) => filtered(...args),
      chips: (...args) => chips(...args),
      state: state,
      cover: (...args) => cover(...args),
      status: (...args) => status(...args),
      bindPoints: (...args) => bindPoints(...args),
      reportDialog: (...args) => reportDialog(...args),
      goNavigate: (...args) => goNavigate(...args),
    }));
  });
}
function loadExplorationPage() {
  return oncePage('exploration', async () => {
    await loadMapPage();
    const [pages, navigation] = await Promise.all([
      import('./pages/exploration.js'),
      import('/shared/navigation.js'),
    ]);
    navigationModule = navigation;
    const { createExplorationPages } = pages;
    ({
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
    }));
  });
}
function loadNotesPage() {
  return oncePage('notes', async () => {
    const { createNotesPages } = await import('./pages/notes.js');
    ({ noteDialog, notesPage } = createNotesPages({
      status: (...args) => status(...args),
      title: title,
      state: state,
      accountDraft: (...args) => accountDraft(...args),
      loadPrivate: (...args) => loadPrivate(...args),
      loginGate: (...args) => loginGate(...args),
      heading: (...args) => heading(...args),
    }));
  });
}
const { authDialog, requireAccount, loginGate, mePage, applyScout } = createAccountPages({
  stopTracking: (...args) => stopTracking(...args),
  stopNavigation,
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
function loadPublishPage() {
  return oncePage('publish', async () => {
    const { createPublishPages } = await import('./pages/publish.js');
    ({ publishPage } = createPublishPages({
      state: state,
      loginGate: (...args) => loginGate(...args),
      authDialog: (...args) => authDialog(...args),
      heading: (...args) => heading(...args),
      applyScout: (...args) => applyScout(...args),
      accountDraft: (...args) => accountDraft(...args),
      draftPhoto: (...args) => draftPhoto(...args),
      pointDialog: (...args) => pointDialog(...args),
    }));
  });
}
function ensurePage(page) {
  if (['plans', 'topics', 'topic', 'collections', 'shared-plan'].includes(page))
    return oncePage('photography', async () => {
      ({ mountPhotography } = await import('./photography.js'));
    });
  if (['spot', 'notifications', 'my-works'].includes(page))
    return oncePage('shooting', async () => {
      ({ mountShootingPage } = await import('./shooting.js'));
    });
  if (['discover', 'search', 'me'].includes(page)) return loadDiscoverPage();
  if (['shots', 'place', 'checkin', 'passport'].includes(page))
    return oncePage('checkins', async () => {
      ({ mountCheckinPage } = await import('./checkins.js'));
    });
  if (page === 'map') return loadMapPage();
  if (page === 'navigate')
    return oncePage('journey', async () => {
      ({ journeyHTML, mountJourney } = await import('./journey.js'));
    });
  if (['routes', 'active'].includes(page)) return loadExplorationPage();
  if (page === 'notes') return loadNotesPage();
  if (page === 'publish') return loadPublishPage();
  return Promise.resolve();
}
let renderRevision = 0;
async function boot() {
  readPageHash();
  shell();
  window.campusStartup?.ready();
  $('#main').innerHTML = '<p class="page-loading" role="status">正在加载页面…</p>';
  if (document.documentElement.classList.contains('viewport-blocked'))
    await new Promise((resolve) => {
      const ready = (e) => {
        if (!e.detail.blocked) {
          window.removeEventListener('viewport:mode', ready);
          resolve();
        }
      };
      window.addEventListener('viewport:mode', ready);
    });
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
    const [catalog, me] = await Promise.all([
      api('/api/catalog?compact=1'),
      api('/api/auth/me').catch((e) => {
        if (!e.status) return { account: null };
        throw e;
      }),
    ]);
    state.catalog = catalog;
    state.unreadNotifications = me.account
      ? (
          await api('/api/notifications/summary').catch(() => ({
            unread: me.unreadNotifications || 0,
            badge: me.unreadNotifications || 0,
          }))
        ).badge
      : 0;
    state.account = me.account;
    setPreferenceAccount(me.account);
    await loadPrivate();
    readPageHash();
    await render();
    window.campusStartup?.ready();
    void import('./message-island.js').then((m) => m.installMessageIslands(() => state));
    startBackground();
    showOnboarding(state.account);
  } catch (e) {
    $('#main').innerHTML =
      '<p class="page-loading" role="alert">页面暂时无法加载，请检查网络后重试。</p><button class="button secondary" id="page-retry">重试</button>';
    $('#page-retry').onclick = boot;
  }
}
bindPointReactions({
  state,
  requireAccount,
  onChanged: () => {
    if (['discover', 'search', 'me'].includes(state.page)) render().catch((e) => toast(e.message));
    if (state.page === 'map' && filtered) {
      const list = $('.map-point-list');
      const items = new Map(
        [...(list?.querySelectorAll('[data-focus]') || [])].map((el) => [el.dataset.focus, el]),
      );
      filtered().forEach((p) => {
        if (items.has(p.id)) list.append(items.get(p.id));
      });
    }
  },
});
startDisplayPreferences();
boot();

let backgroundStarted = false;
function startBackground() {
  if (backgroundStarted) return;
  backgroundStarted = true;
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
  const tasks = [() => import('./pages/map.js'), () => import('./journey.js')];
  const next = () => {
    if (!tasks.length || document.hidden) return;
    const work = () => {
      if (document.hidden) return;
      tasks
        .shift()()
        .catch(() => {})
        .finally(() => setTimeout(next, 2500));
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(work, { timeout: 5000 });
    else setTimeout(work, 1200);
  };
  setTimeout(next, 4000);
}
