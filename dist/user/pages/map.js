import { providerCopy, mapConfigured } from '/shared/map-provider.js';
import { translationHTML } from '/shared/community-translation.js';
import { locationFor } from '/shared/tencent-location.js';
import { $, toast } from '/shared/ui.js';
import { campusMap } from '/shared/map.js';
import { matchingPoints, localSearchHTML, bindLocalSearch } from '../search.js';
import { mapExplorerHTML, mapPointHTML, chooseMapPoint } from '../map-explorer.js';

// 地图显示、选点与本机定位。业务规则与权限由 Java 接口处理。
export function createMapPages({
  heading,
  filtered,
  chips,
  state,
  cover,
  status,
  bindPoints,
  reportDialog,
}) {
  let cancelMapLocate = null;
  function mapPage() {
    return `${heading()}${mapExplorerHTML(filtered(), chips() + localSearchHTML('map-search', '搜索本页校园点位', state.localQuery), cover)}<p class="muted" style="margin:14px 0 0">点位依据公开地图资料，现场通行和拍摄条件以学校规定为准。</p>`;
  }

  async function setupMap() {
    const el = $('#campus-map'),
      points = filtered();
    const applyFilter = (q) => {
      state.localQuery = q;
      const ids = matchingPoints(points, q).map((p) => p.id);
      document
        .querySelectorAll('[data-focus]')
        .forEach((b) => (b.hidden = !ids.includes(b.dataset.focus)));
      $('.map-list-caption').textContent = ids.length + ' 个点位 · 点选后在地图中查看';
      map?.filter?.(ids);
      if (state.mapSelected && !ids.includes(state.mapSelected)) {
        state.mapSelected = null;
        document
          .querySelectorAll('[data-focus]')
          .forEach((b) => b.setAttribute('aria-pressed', 'false'));
        $('#map-point-info').innerHTML =
          '<div class="map-selection-empty"><p>当前筛选未包含原点位，请选择列表中的其他点位。</p></div>';
      }
      $('#map-filter-empty').hidden = ids.length > 0;
    };
    let map;
    bindLocalSearch($('#map-search'), applyFilter, state.localQuery);
    const select = (id, { pan = true, bringIntoView = false } = {}) => {
      const p = chooseMapPoint(points, id);
      if (!p || !el.isConnected) return;
      state.mapSelected = id;
      document
        .querySelectorAll('[data-focus]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.focus === id)));
      map?.select(id, { pan });
      const info = $('#map-point-info');
      info.innerHTML = mapPointHTML(p, {
        cover,
        status,
        translate: translationHTML,
        saved: state.account?.bookmarks?.includes(id),
        canReport: state.account?.scoutStatus === 'approved',
        expanded: !!state.mapExpanded,
      });
      bindPoints(info);
      $('.map-detail-toggle', info).onclick = (e) => {
        state.mapExpanded = !state.mapExpanded;
        e.currentTarget.setAttribute('aria-expanded', String(state.mapExpanded));
        e.currentTarget.textContent = state.mapExpanded ? '收起介绍 ↑' : '展开介绍 ↓';
        $('#map-selected-body').classList.toggle('expanded', state.mapExpanded);
      };
      $('.map-report', info)?.addEventListener('click', () => reportDialog(p));
      if (bringIntoView && matchMedia('(max-width:650px)').matches)
        el.closest('.map-stage').scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    map = await campusMap(el, { ...state.catalog, points }, { onPoint: (id) => select(id) });
    if (!el.isConnected) {
      map.destroy();
      return;
    }
    state.map = map;
    applyFilter(state.localQuery);
    const initial = state.focusPoint || state.mapSelected;
    if (initial) select(initial, { pan: !!state.focusPoint });
    if (!chooseMapPoint(points, initial)) state.mapSelected = null;
    state.focusPoint = null;
    document
      .querySelectorAll('[data-focus]')
      .forEach((b) => (b.onclick = () => select(b.dataset.focus, { bringIntoView: true })));
    $('#map-reset').onclick = () => {
      map.select(null, { pan: false });
      map.overview();
      state.mapSelected = null;
      state.mapExpanded = false;
      document
        .querySelectorAll('[data-focus]')
        .forEach((b) => b.setAttribute('aria-pressed', 'false'));
      $('#map-point-info').innerHTML =
        '<div class="map-selection-empty"><div><strong>全校范围，重新出发。</strong><p>点选地图标记或列表，继续浏览校园点位。</p></div></div>';
    };
    $('#locate').onclick = () => locate(map);
  }

  function locate(map) {
    cancelMapLocate?.();
    if (!mapConfigured(state.catalog)) {
      toast(providerCopy('腾讯地图尚未配置，请联系管理员', state.catalog));
      return;
    }
    toast('正在获取位置，请允许浏览器定位');
    cancelMapLocate = locationFor(state.catalog).getCurrentPosition(
      (p) => {
        if (state.map !== map) return;
        map.locate({
          lng: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: p.coords.accuracy,
        });
        toast(p.coords.accuracy > 200 ? '定位精度较低，请到室外再试' : '已获取当前位置');
      },
      (e) => {
        if (state.map === map)
          toast(
            e.freshness
              ? e.message
              : e.code === 1
                ? '定位权限未开启，可在浏览器设置中允许'
                : '暂时无法获取位置，请稍后重试',
          );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  return {
    mapPage,
    setupMap,
    locate,
    cancelMapLocate: () => {
      cancelMapLocate?.();
      cancelMapLocate = null;
    },
  };
}
