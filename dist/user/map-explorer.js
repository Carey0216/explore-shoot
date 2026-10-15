import { esc, icon } from '/shared/ui.js';

// 地图和列表共享 selectedId；只更新卡片，不重建地图，保留缩放与浏览位置。
export function mapExplorerHTML(points, chips, cover) {
  return `<div class="map-layout map-explorer">
    <section class="map-sidebar" aria-label="校园点位列表">
      ${chips}<p class="map-list-caption">${points.length} 个点位 · 点选后在地图中查看</p>
      <p id="map-filter-empty" class="page-filter-empty" hidden>没有匹配点位，试试其他关键词。</p><div class="map-point-list">${points.map((p) => `<button class="map-item" data-focus="${esc(p.id)}" aria-pressed="false" aria-controls="map-point-info"><img src="${esc(cover(p))}" alt=""><span><strong>${esc(p.name)}</strong><small>${esc(p.theme)} · ${p.open ? '可前往' : '暂时关闭'}</small></span><span class="map-item-arrow" aria-hidden="true">↗</span></button>`).join('') || '<p class="muted">没有匹配点位，请换一个分类。</p>'}</div>
    </section>
    <section class="map-stage">
      <div class="map-panel"><div id="campus-map" class="map-canvas" role="region" aria-label="北方民族大学真实校园地图"></div><div class="map-tools"><button class="button map-location-icon" id="locate" aria-label="定位到我" title="定位到我">${icon('pin')}</button><button class="button" id="map-reset">全校范围</button></div></div>
      <section id="map-point-info" class="map-point-info" aria-label="选中点位介绍"><div class="map-selection-empty"><span>${icon('pin')}</span><div><strong>选择点位</strong><p>点击地图标记或列表，查看位置与详情。</p></div></div></section>
    </section>
  </div>`;
}

export function mapPointHTML(
  p,
  { cover, status, saved, canReport, expanded, translate = () => '', reactions = () => '' },
) {
  return `<div class="map-selected-summary"><img src="${esc(cover(p))}" alt="${esc(p.name)}${p.cover ? '' : ' · 校园参考配图'}"><div><span class="map-detail-eyebrow">${esc(p.theme)} · ${p.open ? '可前往探索' : '暂时关闭'}</span><h2 id="map-selected-name" tabindex="-1">${esc(p.name)}</h2>${status(p)}</div></div>
    <div class="map-selected-actions"><button class="button" data-route-to="${esc(p.id)}" ${p.open ? '' : 'disabled'}>${icon('walk')} 到这里去</button><button class="button secondary ${saved ? 'saved' : ''}" data-save="${esc(p.id)}" aria-label="${saved ? '取消收藏' : '收藏'}${esc(p.name)}">${icon('heart')} 收藏</button><button type="button" class="text-btn map-detail-toggle" aria-expanded="${expanded}" aria-controls="map-selected-body">${expanded ? '收起介绍 ↑' : '展开介绍 ↓'}</button></div>
    ${reactions(p)}<div id="map-selected-body" class="map-selected-body ${expanded ? 'expanded' : ''}"><p>${esc(p.description)}</p>${translate(p)}<div class="map-condition"><strong>前往与拍摄提醒</strong><p>${esc(p.condition)}</p></div><small>${p.cover ? '探索官 ' + esc(p.authorName) : '校园参考配图 · 不代表该点位当前现场'}<br>资料来源：${esc(p.source)}${p.verifiedAt ? '<br>认证日期：' + esc(p.verifiedAt) : ''}<br>坐标：${Number(p.lng).toFixed(6)}, ${Number(p.lat).toFixed(6)} · WGS84</small>${canReport ? '<button class="text-btn map-report" type="button">反馈点位问题 ↗</button>' : ''}</div>`;
}

export function chooseMapPoint(points, id) {
  return points.find((p) => p.id === id) || null;
}
