import { providerCopy, mapConfigured } from '/shared/map-provider.js';
import { translationHTML } from '/shared/community-translation.js';
import { locationFor } from '/shared/tencent-location.js';
import { $, toast, esc, api } from '/shared/ui.js';
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
    return `${heading()}${mapExplorerHTML(filtered(), '<div class="campus-visual-buttons"><button class="button secondary" id="campus-panorama-open">实景全景 ↗</button><button class="button secondary" id="campus-model-open">三维校园 ↗</button></div>' + chips() + localSearchHTML('map-search', '搜索本页校园点位', state.localQuery), cover)}<p class="muted" style="margin:14px 0 0">点位依据公开地图资料，现场通行和拍摄条件以学校规定为准。</p>`;
  }

  async function setupMap() {
    const el = $('#campus-map'),
      points = filtered();
    const visual = (id, load, open) => {
      const button = $(id);
      button.onclick = async () => {
        button.disabled = true;
        try {
          const module = await load();
          if (el.isConnected) open(module);
        } catch (e) {
          if (el.isConnected) toast(e.message);
        } finally {
          button.disabled = false;
        }
      };
    };
    visual(
      '#campus-panorama-open',
      () => import('/shared/campus-panorama.js'),
      (m) => m.openCampusPanorama(),
    );
    visual(
      '#campus-model-open',
      () => import('/shared/campus-model.js'),
      (m) => m.openCampusModel(),
    );
    let directory = [],
      activeBuilding = null;
    const placesHost = document.createElement('section');
    placesHost.className = 'campus-places';
    placesHost.innerHTML =
      '<h3>校园地点</h3><input type="search" id="campus-directory-search" placeholder="搜索学院、楼号或地点" aria-label="搜索已确认校园地点"><div class="campus-directory" id="campus-directory"><p>正在载入校园地点…</p></div>';
    $('.map-sidebar').append(placesHost);
    try {
      directory = (await api('/api/maps/places')).places;
    } catch {
      if (el.isConnected) $('#campus-directory').textContent = '校园地点暂时无法载入';
    }
    if (!el.isConnected) return;
    const directoryList = () => {
      const q = $('#campus-directory-search').value.trim().toLowerCase();
      const visible = directory.filter((p) =>
        [p.name, p.aliases, p.category, p.zone].join(' ').toLowerCase().includes(q),
      );
      $('#campus-directory').innerHTML =
        visible
          .map(
            (p) =>
              `<button class="button secondary" data-campus-location="${esc(p.id)}">${esc(p.name)}</button>`,
          )
          .join('') || '<p>暂无匹配的已确认校园地点；图示建筑需先由管理员校准。</p>';
      placesHost
        .querySelectorAll('[data-campus-location]')
        .forEach(
          (b) =>
            (b.onclick = () => showPlace(directory.find((p) => p.id === b.dataset.campusLocation))),
        );
      return visible.map((p) => p.id);
    };
    const showPlace = (p) => {
      if (!p) return;
      activeBuilding = null;
      state.mapSelected = null;
      map?.select(p.id);
      $('#map-point-info').innerHTML =
        `<section class="map-building-detail" data-i18n-skip><h3>${esc(p.name)}</h3><p>${esc(p.zone + ' · ' + p.category)}</p><p>${esc(p.description)}</p><small>已校准校园地点<br>${esc(p.source)}</small></section>`;
    };
    $('#campus-directory-search').oninput = () => applyFilter(state.localQuery);
    const applyFilter = (q) => {
      state.localQuery = q;
      const ids = matchingPoints(points, q).map((p) => p.id);
      const placeIds = directoryList();
      document
        .querySelectorAll('[data-focus]')
        .forEach((b) => (b.hidden = !ids.includes(b.dataset.focus)));
      $('.map-list-caption').textContent = ids.length + ' 个点位 · 点选后在地图中查看';
      map?.filter?.([...ids, ...placeIds]);
      if (state.mapSelected && !ids.includes(state.mapSelected)) {
        state.mapSelected = null;
        document
          .querySelectorAll('[data-focus]')
          .forEach((b) => b.setAttribute('aria-pressed', 'false'));
        $('#map-point-info').innerHTML =
          '<div class="map-selection-empty"><p>当前筛选未包含原点位，请选择列表中的其他点位。</p></div>';
      }
      $('#map-filter-empty').hidden = ids.length > 0;
      if (activeBuilding) showBuilding(activeBuilding);
    };
    let map;
    bindLocalSearch($('#map-search'), applyFilter, state.localQuery);
    const select = (id, { pan = true, bringIntoView = false } = {}) => {
      const p = chooseMapPoint(points, id);
      if (!p || !el.isConnected) return;
      activeBuilding = null;
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
    const showBuilding = (building) => {
      if (!el.isConnected) return;
      activeBuilding = building;
      state.mapSelected = null;
      map?.select(null, { pan: false });
      document
        .querySelectorAll('[data-focus]')
        .forEach((b) => b.setAttribute('aria-pressed', 'false'));
      const nearby = matchingPoints(points, state.localQuery).filter((p) =>
        building.pointIds.includes(p.id),
      );
      $('#map-point-info').innerHTML =
        `<section class="map-building-detail"><h3>${esc(building.name || '校园建筑')}</h3><p>${building.estimated ? '展示高度为估算值，尚未实测。' : '高度采用公开地图标注，尚未实测核验。'}<br>建筑轮廓来自公开地图，楼块不代表内部通道或可通行入口。</p><a href="${esc(building.sourceUrl)}" target="_blank" rel="noopener">查看建筑数据来源 ↗</a><div class="building-points"><strong>附近机位</strong>${nearby.length ? nearby.map((p) => `<button type="button" class="button secondary" data-building-point="${esc(p.id)}">${esc(p.name)} ↗</button>`).join('') : '<p>附近暂无已发布机位</p>'}</div></section>`;
      $('#map-point-info')
        .querySelectorAll('[data-building-point]')
        .forEach((b) => (b.onclick = () => select(b.dataset.buildingPoint)));
    };
    map = await campusMap(
      el,
      { ...state.catalog, points: [...points, ...directory] },
      {
        onPoint: (id) => {
          const p = directory.find((p) => p.id === id);
          p ? showPlace(p) : select(id);
        },
        onBuilding: showBuilding,
      },
    );
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
      activeBuilding = null;
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
