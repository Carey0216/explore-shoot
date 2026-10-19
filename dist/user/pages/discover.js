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
    return `<article class="point-card" style="animation-delay:${Math.min(i, 6) * 35}ms"><button class="photo-wrap ${!p.open ? 'closed-photo' : ''}" data-point="${p.id}" aria-label="查看${esc(p.name)}" style="width:100%;padding:0;display:block"><img src="${esc(thumbnail(cover(p)))}" alt="${p.cover ? esc(p.name) : p.id === 'nmu1' ? '北方民族大学图书馆参考照片' : '北方民族大学校园参考配图'}" loading="${i < 3 ? 'eager' : 'lazy'}"><span class="photo-label">${state.visitedIds?.has(p.id) ? '我已打卡 · ' : ''}${p.trust === 'certified' ? '已认证' : p.trust === 'community' ? '社区共创' : p.theme + ' · 推荐探索'}</span><span class="photo-caption">${p.theme === '建筑' ? '在光影里，停留一会' : p.theme === '运动' ? '把奔跑的日常定格' : '日常，也会有新风景'}</span></button><div class="photo-credit">${p.cover ? '探索官 ' + esc(p.authorName) : '校园参考配图 · 国家民委 / 北方民族大学'}</div><button class="card-title" data-point="${p.id}">${esc(p.name)}</button><p class="card-description">${esc(p.description)}</p>${reactionHTML(p)}<div class="card-bottom"><span>${icon('pin')}${p.open ? '北方民族大学' : '暂时关闭'}</span><button class="text-btn card-route" data-route-to="${p.id}" ${p.open ? '' : 'disabled'} aria-label="步行前往${esc(p.name)}">↗ 去这里</button><button class="icon-btn bookmark ${state.account?.bookmarks?.includes(p.id) ? 'saved' : ''}" data-save="${p.id}" aria-label="${state.account?.bookmarks?.includes(p.id) ? '取消收藏' : '收藏'}${esc(p.name)}">${icon('heart')}</button></div></article>`;
  }

  function discovery() {
    const points = filtered();
    return `${heading()}<section class="discovery-checkin"><div><strong>拍摄地点与打卡</strong><p>机位、拍摄建议和你的到访记录</p></div><a class="button" href="#shots">${icon('camera')} 打卡机位 ↗</a></section><div class="feed-layout"><div>${chips()}${state.query ? `<p class="muted">「${esc(state.query)}」的发现 <button class="text-btn" id="clear-search">清除搜索</button></p>` : ''}<div class="feed-grid">${points
      .slice(0, state.discoveryLimit || 12)
      .map(card)
      .join(
        '',
      )}</div>${points.length > (state.discoveryLimit || 12) ? '<button class="button secondary" id="discover-more">加载更多发现</button>' : ''}${!points.length ? '<div class="empty">这个角落，还等着你来发现。<br>试试其他分类，或分享一个新点位。</div>' : ''}</div><aside class="feed-aside"><div class="daily-card"><span class="daily-doodle">&</span><span class="eyebrow">校园探索</span><h2>选一条路线</h2><p>按时间、主题查看拍摄任务。</p><a href="#routes" class="button">${icon('walk')} 选一条小路</a></div><div class="aside-title">校园，近在眼前 <span>on the map</span></div><button class="map-open" id="map-open"><img src="/shared/nmu-campus.jpg?size=thumb" loading="lazy" decoding="async" alt="北方民族大学校园参考照片"><div><strong>${state.catalog.points.length} 个起点，一整座校园</strong><small>打开真实地图，找找下一个目的地</small></div></button><a class="aside-link" href="#publish">${icon('camera')} 成为校园探索官，分享新发现</a><a class="aside-link" href="#notes">${icon('book')} 翻一翻自己的探索手记</a></aside></div>`;
  }
  return { filtered, chips, card, discovery };
}
