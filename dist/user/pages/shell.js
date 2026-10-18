import { mobileItems, navSelected, outingTabs } from '../outings.js';
import { $, esc, icon, closeModal } from '/shared/ui.js';
import { avatarHTML } from '/shared/profile.js';
import { cleanQuery } from '../search.js';

// 全局入口与顶部栏。业务规则与权限由 Java 接口处理。
export function createShellPages({ state, nav, authDialog, render, title }) {
  function shell() {
    const page = state.page;
    document.body.dataset.page = page;
    $('#topbar').classList.toggle('compact-header', page !== 'discover');
    $('#topbar').innerHTML =
      `<a href="#discover" class="mobile-brand"><span class="brand-mark"></span>探索与拍摄</a>${page !== 'discover' ? '' : `<form id="search-form" class="search-box">${icon('search')}<input aria-label="搜索校园点位" name="q" maxlength="100" placeholder="搜一个地方，或者一种心情" value="${esc(state.query)}"></form>`}<div class="header-right">${page === 'discover' ? `<button class="icon-btn mobile-search" id="mobile-search" aria-label="搜索校园点位">${icon('search')}</button>` : ''}<a href="#notifications" class="message-link" aria-label="站内通知" data-feature="notifications">${icon('message')}<b data-notification-count ${state.unreadNotifications ? '' : 'hidden'}>${state.unreadNotifications || ''}</b></a>${state.account ? `<button class="avatar" id="account-open" aria-label="我的账号">${avatarHTML(state.account)}</button>` : '<button class="button secondary small" id="login-open">登录 / 注册</button>'}</div>`;
    $('#search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      openSearch(new FormData(e.target).get('q'));
    });
    $('#mobile-search')?.addEventListener('click', () => openSearch());
    $('#login-open')?.addEventListener('click', () => authDialog());
    $('#account-open')?.addEventListener('click', () => (location.hash = 'me'));
    $('#mobile-nav').innerHTML = mobileItems
      .map(
        ([p, i, t]) =>
          `<a href="#${p}" class="${navSelected(p, page) ? 'active' : ''}" ${navSelected(p, page) ? 'aria-current="page"' : ''}>${icon(i)}${t}</a>`,
      )
      .join('');
    const dock = $('#mobile-nav');
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'dock-create';
    add.dataset.feature = 'publishing';
    add.setAttribute('aria-label', '发布校园发现');
    add.innerHTML = icon('plus');
    dock.insertBefore(add, dock.children[2]);
    add.onclick = () =>
      import('../scout.js').then((m) => m.publishEntry({ state, authDialog, render }));
  }

  function openSearch(query = state.query) {
    closeModal();
    state.query = cleanQuery(query);
    state.theme = '全部';
    state.focusSearch = true;
    if (state.page === 'search') render();
    else {
      state.pendingSearchQuery = state.query;
      location.hash = 'search';
    }
  }

  function heading() {
    if (state.page === 'discover')
      return `<section class="discover-strip"><div><h1>校园发现</h1></div><a class="text-btn" href="#shots">${icon('camera')} 查看机位 ↗</a></section>`;
    const [h, p] = title[state.page] || title.discover;
    return `${outingTabs(state.page)}${['map', 'routes', 'active'].includes(state.page) ? '' : `<div class="page-heading"><div><h1>${h}</h1>${p ? `<p>${p}</p>` : ''}</div></div>`}`;
  }
  return { shell, openSearch, heading };
}
