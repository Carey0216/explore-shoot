import { api } from '/shared/ui.js';
export function campusBounds(campus) {
  const coords = (campus?.boundary || [])
    .map((p) => (Array.isArray(p) ? { lng: p[0], lat: p[1] } : p))
    .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
  if (!coords.length) return null;
  return {
    west: Math.min(...coords.map((p) => p.lng)) - 0.0001,
    east: Math.max(...coords.map((p) => p.lng)) + 0.0001,
    south: Math.min(...coords.map((p) => p.lat)) - 0.0001,
    north: Math.max(...coords.map((p) => p.lat)) + 0.0001,
  };
}
export function viewportLoader({ map, campus, onPoints, onStatus, alive }) {
  let generation = 0,
    timer = null,
    signature = '',
    page = 1,
    items = [],
    bounds = null,
    disposed = false;
  const current = () => !disposed && alive();
  const load = async (append = false) => {
    if (!current()) return;
    let next;
    try {
      next = map.getViewport?.() || campusBounds(campus);
    } catch {
      onStatus('暂时无法读取地图范围，请稍后重试', false);
      return;
    }
    if (!next) return;
    const key = Object.values(next)
      .map((n) => Number(n).toFixed(5))
      .join(',');
    append = append && key === signature;
    if (!append && key === signature) return;
    const stamp = ++generation;
    onStatus('正在加载当前地图范围…', false);
    try {
      const query = new URLSearchParams({ ...next, page: append ? page + 1 : 1 });
      const data = await api('/api/map/points?' + query);
      if (!current() || stamp !== generation) return;
      signature = key;
      bounds = next;
      page = data.page;
      items = append
        ? [...items, ...data.points.filter((p) => !items.some((x) => x.id === p.id))]
        : data.points;
      items = items.slice(-180);
      onPoints(items);
      onStatus(
        `当前范围 ${data.total} 个点位 · 已载入 ${items.length} 个${data.hasMore ? '，可加载更多或放大地图' : ''}`,
        data.hasMore && items.length < 180,
      );
    } catch (error) {
      if (current() && stamp === generation) {
        signature = '';
        onStatus(error.message + ' · 可以移动地图或重试', false);
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(false), 250);
  };
  const unsubscribe = map.onViewport?.(schedule);
  void load(false);
  return {
    more: () => load(true),
    refresh: () => {
      signature = '';
      return load(false);
    },
    dispose: () => {
      disposed = true;
      generation++;
      clearTimeout(timer);
      unsubscribe?.();
    },
    get bounds() {
      return bounds;
    },
  };
}
