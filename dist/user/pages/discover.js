import { api, thumbnail } from '/shared/ui.js';
import { reactionHTML } from '/shared/point-reactions.js';
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
    return `<article class="point-card"><button class="photo-wrap ${!p.open ? 'closed-photo' : ''}" data-point="${esc(p.id)}" aria-label="查看${esc(p.name)}" style="width:100%;padding:0;display:block"><img width="${Number(p.coverWidth) || 480}" height="${Number(p.coverHeight) || 320}" src="${esc(thumbnail(cover(p)))}" alt="${esc(p.name)}${p.cover ? '' : ' · 校园参考配图'}" loading="${i < 12 ? 'eager' : 'lazy'}" decoding="async">${state.visitedIds?.has(p.id) ? '<span class="photo-label">已打卡</span>' : ''}</button><button class="card-title" data-point="${esc(p.id)}">${esc(p.name)}</button><div class="photo-credit" title="${p.cover ? '探索官 ' + esc(p.authorName) : '校园参考配图 · 国家民委 / 北方民族大学'}">${p.cover ? esc(p.authorName) : '校园参考配图'}</div>${reactionHTML(p)}<div class="card-bottom"><button class="text-btn card-route" data-route-to="${esc(p.id)}" ${p.open ? '' : 'disabled'} aria-label="步行前往${esc(p.name)}">${icon('pin')}<span>${p.open ? '去这里' : '暂时关闭'}</span></button><button class="icon-btn bookmark ${state.account?.bookmarks?.includes(p.id) ? 'saved' : ''}" data-save="${esc(p.id)}" aria-label="${state.account?.bookmarks?.includes(p.id) ? '取消收藏' : '收藏'}${esc(p.name)}">${icon('heart')}</button></div></article>`;
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
    return `<section class="discovery-heading"><h1>发现校园</h1><a class="text-btn" href="#routes">${icon('walk')} 探索路线</a></section><a class="guide-entry" href="#guides"><span>${icon('book')}</span><div><strong>从哪里开始拍？</strong><small>新生入门 · 短途路线</small></div><b>↗</b></a>${chips()}${state.query ? `<p class="muted">「${esc(state.query)}」的发现 <button class="text-btn" id="clear-search">清除搜索</button></p>` : ''}<div class="feed-grid">${points.map(card).join('')}</div>${state.feed.hasMore ? '<button class="button secondary wide" id="discover-more">加载更多发现</button>' : ''}${!points.length ? '<div class="empty">还没有匹配的发现，试试其他分类。</div>' : ''}`;
  }
  return { filtered, chips, card, discovery };
}
