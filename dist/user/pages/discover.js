import { shootingLine } from '/shared/content73.js';
import { api, thumbnail } from '/shared/ui.js';
import { esc, icon } from '/shared/ui.js';
import { matchesText } from '../search.js';

// 发现页面和点位卡片。业务规则与权限由 Java 接口处理。
export function createDiscoverPages({ state, cover, heading }) {
  function filtered() {
    const order = ['nmu1', 'nmu8', 'nmu2', 'nmu6', 'nmu3', 'nmu7', 'nmu4', 'nmu5'];
    return state.catalog.points
      .filter(
        (p) =>
          (state.theme === '全部' || p.theme === state.theme) &&
          (state.page === 'map' ||
            matchesText([p.name, p.description, p.theme].join(' '), state.query)),
      )
      .sort((a, b) => {
        const x = order.indexOf(a.id),
          y = order.indexOf(b.id);
        return (
          Number(a.myReaction === 'dislike') - Number(b.myReaction === 'dislike') ||
          (x < 0 ? -1 : x) - (y < 0 ? -1 : y) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt)
        );
      });
  }

  function chips() {
    return `<div class="chips discovery-filters">${['全部', '建筑', '自然', '人文', '运动'].map((t) => `<button class="chip ${state.theme === t ? 'active' : ''}" data-theme="${t}">${t === '全部' ? '为你推荐' : t}</button>`).join('')}</div>`;
  }

  function card(p, i) {
    return `<article class="point-card content-story73"><button data-no-liquid class="photo-wrap ${!p.open ? 'closed-photo' : ''}" data-point="${esc(p.id)}" aria-label="查看${esc(p.name)}"><img width="480" height="360" src="${esc(thumbnail(cover(p)))}" alt="${esc(p.name)}${p.cover ? '' : ' · 校园参考配图'}" loading="${i < 12 ? 'eager' : 'lazy'}" decoding="async">${state.visitedIds?.has(p.id) ? '<span class="photo-label">已打卡</span>' : ''}</button><button data-no-liquid class="card-title" data-point="${esc(p.id)}">${esc(p.name)}</button><p class="story-line73">${esc(shootingLine(p))}</p><small class="photo-credit">${p.cover ? esc(p.authorName || '校园发现') : '校园参考配图'}</small></article>`;
  }
  async function discovery() {
    const key = JSON.stringify([
      state.account?.id,
      state.theme,
      state.query,
      state.catalog.version,
    ]);
    if (state.feed?.key !== key) {
      const result = await api('/api/points/search', 'POST', {
        theme: state.theme,
        query: state.query,
        page: 1,
        pageSize: 12,
      });
      state.feed = { ...result, key };
    }
    const points = state.feed.points;
    // Keep detail/navigation data only for pages actually fetched.
    for (const p of points)
      if (!state.catalog.points.some((x) => x.id === p.id)) state.catalog.points.push(p);
    const lead = points[0];
    return `<section class="discovery-heading"><h1>发现校园</h1><a class="text-btn" href="#routes" data-feature="exploration">${icon('walk')} 探索路线</a></section><a class="guide-entry" href="#guides" data-feature="exploration"><span>${icon('book')}</span><div><strong>从哪里开始拍？</strong><small>新生入门 · 短途路线</small></div><b>↗</b></a>${chips()}${state.query ? `<p class="muted">「${esc(state.query)}」的发现 <button class="text-btn" id="clear-search">清除搜索</button></p>` : ''}${lead ? `<section class="discover-feature73"><button data-no-liquid class="feature-photo73" data-point="${esc(lead.id)}" aria-label="查看${esc(lead.name)}"><img src="${esc(thumbnail(cover(lead)))}" alt="${esc(lead.name)}${lead.cover ? '' : ' · 校园参考配图'}"><span>${esc(lead.theme)} / ${esc(lead.name)}</span></button><h2>${esc(lead.name)}</h2><p class="photo-credit">${lead.cover ? esc(lead.authorName || '校园发现') : '校园参考配图'}</p><p class="shooting-line73">${esc(shootingLine(lead))}</p><div class="button-row"><button data-no-liquid class="button" data-point="${esc(lead.id)}">去拍这张 ${icon('arrow')}</button><a class="text-btn" href="#routes" data-feature="exploration">沿路再走走 ${icon('arrow')}</a></div></section>` : ''}${points.length > 1 ? '<h2 class="quiet-heading73">换个方向看看</h2>' : ''}<div class="feed-grid">${points.slice(1).map(card).join('')}</div>${state.feed.hasMore ? '<button class="button secondary wide" id="discover-more">加载更多发现</button>' : ''}${!points.length ? '<div class="empty"><h2>还没有匹配的发现</h2><p>试试其他分类，或者清除搜索看看。</p></div>' : ''}`;
  }
  return { filtered, chips, card, discovery };
}
