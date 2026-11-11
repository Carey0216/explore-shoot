import { api, esc, icon } from '/shared/ui.js';
import { featureVisible, featureOn } from '/shared/features.js';
let hint,
  timer,
  sequence = 0,
  cache,
  cacheOwner = '',
  cacheAt = 0;
const shown = new Set();
const nextHintAt = new Map();
export function closeCollectionHint() {
  clearTimeout(timer);
  hint?.remove();
  hint = null;
}
export function installCollectionGuidance(context) {
  const enter = async (force = false) => {
    const visit = ++sequence,
      route = location.hash || '#discover',
      state = context(),
      owner = state.account?.id;
    if (
      !owner ||
      !featureVisible('passport') ||
      !featureOn('passport') ||
      !/^#(?:discover|shots|map|me|plans|guides|routes|spot\/|place\/|topic\/)/.test(route)
    )
      return;
    if (!force && shown.has(owner + ':' + route)) return;
    try {
      if (cacheOwner !== owner || Date.now() - cacheAt > 30000) {
        const result = await api('/api/my/passport');
        if (visit !== sequence || context().account?.id !== owner) return;
        cache = result;
        cacheOwner = owner;
        cacheAt = Date.now();
      }
      let point = state.page === 'place' ? state.placeId : '';
      if (state.page === 'spot') {
        const spot = await api('/api/shooting-spots/' + encodeURIComponent(state.placeId));
        if (visit !== sequence || context().account?.id !== owner) return;
        point = spot.pointId;
      }
      const buildings = cache.atlas.buildings.filter(
        (b) => b.frame === 'photo' && b.pointIds.length,
      );
      const openPoints = new Set(
        state.catalog.points
          .filter((p) => p.open !== false && p.published !== false)
          .map((p) => p.id),
      );
      const linked = openPoints.has(point)
          ? buildings.find((b) => b.pointIds.includes(point))
          : null,
        recommendation = cache.nextBuildings?.find((b) => openPoints.has(b.pointId)),
        next =
          buildings.find((b) => b.id === recommendation?.buildingId) ||
          buildings.find((b) => !b.collected && b.pointIds.some((id) => openPoints.has(id)));
      const target = linked || next;
      if (!target) return;
      if (!linked && Date.now() < (nextHintAt.get(owner) || 0)) return;
      const id = linked
        ? point
        : recommendation?.pointId || target.pointIds.find((id) => openPoints.has(id));
      if (!id) return;
      const name =
        state.catalog.points.find((p) => p.id === id)?.name || target.displayName || target.name;
      const show = () => {
        if (visit !== sequence || context().account?.id !== owner || location.hash !== route)
          return;
        if (window.scrollY > 24) return;
        if (
          document.hidden ||
          document.querySelector(
            'dialog[open],.feature-tour,.message-island812:not([hidden]),.activity-reward-island',
          ) ||
          document.activeElement?.matches('input,textarea')
        ) {
          timer = setTimeout(show, 500);
          return;
        }
        closeCollectionHint();
        shown.add(owner + ':' + route);
        if (!linked) nextHintAt.set(owner, Date.now() + 30000);
        hint = document.createElement('aside');
        hint.className = 'collection-live813';
        const english = document.documentElement.lang === 'en-US';
        const title = linked
          ? linked.collected
            ? english
              ? 'Revisit ' + name
              : '再走一次「' + name + '」'
            : english
              ? 'Light up this building'
              : '这一站，能让建筑落进你的校园'
          : (english ? 'Next building · ' : '下一栋 · ') + name;
        const action = linked
          ? english
            ? 'Check in and watch it land'
            : '去打卡，看建筑落位'
          : english
            ? 'See the place and route'
            : '查看地点和路线';
        hint.setAttribute('role', 'status');
        hint.innerHTML =
          icon('passport') +
          `<div><strong>${esc(title)}</strong><a href="${linked ? '#checkin/' + esc(id) : '#passport?building=' + encodeURIComponent(target.id)}">${action} ↗</a></div><button data-no-liquid aria-label="${english ? 'Dismiss collection tip' : '关闭收集提示'}">${icon('close')}</button>`;
        if (state.page === 'place' || state.page === 'spot') {
          hint.classList.add('collection-live813--over-hero');
          document.body.append(hint);
        } else {
          const main = document.querySelector('#main');
          const tabs = main?.querySelector(':scope > .community-tabs, :scope > .outing-tabs');
          if (tabs) tabs.after(hint);
          else main?.prepend(hint);
        }
        hint.querySelector('button').onclick = closeCollectionHint;
        timer = setTimeout(closeCollectionHint, 6500);
      };
      timer = setTimeout(show, 900);
    } catch {
      /* A hint must never block the real task. */
    }
  };
  document.addEventListener('campus:page-ready', () => void enter());
  document.addEventListener('campus:modal-open', closeCollectionHint);
  document.addEventListener('campus:passport-presented', () => {
    cacheAt = 0;
    void enter(true);
  });
  window.addEventListener('hashchange', () => {
    sequence++;
    closeCollectionHint();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) closeCollectionHint();
  });
}
