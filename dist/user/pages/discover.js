import { thumbnail } from '/shared/ui.js';
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
    return `<div class="chips">${['全部', '建筑', '自然', '人文', '运动'].map((t) => `<button class="chip ${state.theme === t ? 'active' : ''}" data-theme="${t}">${t === '全部' ? '为你推荐' : t === '建筑' ? '建筑光影' : t === '自然' ? '自然角落' : t === '人文' ? '校园日常' : '运动瞬间'}</button>`).join('')}</div>`;
  }

  function card(p, i) {
    return `<article class="point-card"><button class="photo-wrap ${!p.open ? 'closed-photo' : ''}" data-point="${esc(p.id)}" aria-label="查看${esc(p.name)}" style="width:100%;padding:0;display:block"><img src="${esc(thumbnail(cover(p)))}" alt="${esc(p.name)}${p.cover ? '' : ' · 校园参考配图'}" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async">${state.visitedIds?.has(p.id) ? '<span class="photo-label">已打卡</span>' : ''}</button><button class="card-title" data-point="${esc(p.id)}">${esc(p.name)}</button><div class="photo-credit" title="${p.cover ? '探索官 ' + esc(p.authorName) : '校园参考配图 · 国家民委 / 北方民族大学'}">${p.cover ? esc(p.authorName) : '校园参考配图'}</div>${reactionHTML(p)}<div class="card-bottom"><button class="text-btn card-route" data-route-to="${esc(p.id)}" ${p.open ? '' : 'disabled'} aria-label="步行前往${esc(p.name)}">${icon('pin')}${p.open ? '去这里' : '暂时关闭'}</button><button class="icon-btn bookmark ${state.account?.bookmarks?.includes(p.id) ? 'saved' : ''}" data-save="${esc(p.id)}" aria-label="${state.account?.bookmarks?.includes(p.id) ? '取消收藏' : '收藏'}${esc(p.name)}">${icon('heart')}</button></div></article>`;
  }
  function discovery() {
    const points = filtered(),
      limit = state.discoveryLimit || 12;
    return `<section class="discovery-heading"><h1>发现校园</h1><a class="text-btn" href="#routes">${icon('walk')} 探索路线</a></section>${chips()}${state.query ? `<p class="muted">「${esc(state.query)}」的发现 <button class="text-btn" id="clear-search">清除搜索</button></p>` : ''}<div class="feed-grid">${points.slice(0, limit).map(card).join('')}</div>${points.length > limit ? '<button class="button secondary wide" id="discover-more">加载更多发现</button>' : ''}${!points.length ? '<div class="empty">还没有匹配的发现，试试其他分类。</div>' : ''}`;
  }
  return { filtered, chips, card, discovery };
}
