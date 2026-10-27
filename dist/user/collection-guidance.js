import { api, esc, icon } from '/shared/ui.js';
import { featureVisible, featureOn } from '/shared/features.js';
let hint,
  timer,
  sequence = 0,
  cache,
  cacheOwner = '',
  cacheAt = 0;
const shown = new Set();
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
      const linked = buildings.find((b) => b.pointIds.includes(point)),
        next = buildings.find(
          (b) =>
            !b.collected &&
            b.pointIds.some((id) =>
              state.catalog.points.some((p) => p.id === id && p.published !== false),
            ),
        );
      const target = linked || next;
      if (!target) return;
      const id = linked
        ? point
        : target.pointIds.find((id) => state.catalog.points.some((p) => p.id === id));
      if (!id) return;
      const show = () => {
        if (visit !== sequence || context().account?.id !== owner || location.hash !== route)
          return;
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
        hint = document.createElement('aside');
        hint.className = 'collection-live813';
        hint.setAttribute('role', 'status');
        hint.innerHTML =
          icon('passport') +
          `<div><strong>${esc(linked ? (linked.collected ? '再走一次「' + target.name + '」' : '这一站，能让建筑落进你的校园') : '下一栋，去点亮「' + target.name + '」')}</strong><small>${esc(linked ? (linked.collected ? '再次打卡，留下新的足迹，重温建筑落位' : '完成真实打卡，看「' + target.name + '」从大到小落位') : '看看关联地点与路线，让收集图再多一抹颜色')}</small><a href="${linked ? '#checkin/' + esc(id) : '#passport?building=' + encodeURIComponent(target.id)}">${linked ? '去打卡' : '看看下一栋'} ↗</a></div><button data-no-liquid aria-label="关闭收集提示">${icon('close')}</button>`;
        document.body.append(hint);
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
