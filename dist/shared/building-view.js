// Lazy display data: switching views never plans a route or changes stored coordinates.
let pending = null;
let loadedAt = 0;
export function loadBuildings() {
  if (pending && loadedAt && Date.now() - loadedAt >= 30_000) pending = null;
  if (!pending) {
    const request = fetch('/api/maps/buildings', { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw Error('建筑图层暂不可用');
        return r.json();
      })
      .then((data) => {
        if (data.coordinateSystem !== 'WGS84' || !Array.isArray(data.buildings))
          throw Error('建筑数据无效');
        if (pending === request) loadedAt = Date.now();
        return data;
      })
      .catch((e) => {
        if (pending === request) pending = null;
        throw e;
      });
    pending = request;
  }
  return pending;
}

function buildingLayer(T, map, ll, buildings, id, onBuilding) {
  const styles = {};
  const geometries = [];
  const records = new Map();
  for (const building of buildings) {
    const { id, height, footprint, holes = [], color } = building;
    if (
      !id ||
      !Array.isArray(footprint) ||
      footprint.length < 4 ||
      !Number.isFinite(height) ||
      height <= 0
    )
      continue;
    records.set(id, building);
    styles[id] = new T.ExtrudablePolygonStyle({
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#c8cdd1',
      extrudeHeight: height,
      showBorder: false,
    });
    geometries.push({
      id,
      styleId: id,
      paths: [footprint, ...holes].map((ring) => ring.map(ll)),
    });
  }
  if (!geometries.length) return null;
  const layer = new T.MultiPolygon({
    map,
    id,
    styles,
    geometries,
    disableInteractive: !onBuilding,
    zIndex: 5,
    isStopPropagation: !!onBuilding,
  });
  if (onBuilding)
    layer.on('click', (event) => {
      const record = records.get(event.geometry?.id);
      if (record) onBuilding(record);
    });
  return layer;
}

export function tencentBuildings(T, map, ll, onBuilding) {
  let layer = null,
    preview = null,
    count = 0,
    signature = null,
    disposed = false,
    visible = false,
    generation = 0;
  return {
    async show(active) {
      if (disposed) return null;
      const id = ++generation;
      visible = active;
      if (!active) {
        layer?.setVisible(false);
        return null;
      }
      layer?.setVisible(true);
      if (!T.ExtrudablePolygonStyle) throw Error('当前地图组件不支持立体建筑');
      const data = await loadBuildings();
      if (disposed || generation !== id) return null;
      const supplements = (data.supplements ?? []).filter((b) => b.coverage === 'missing');
      const nextSignature = JSON.stringify(supplements);
      if (nextSignature === signature) return count;
      const next = buildingLayer(
        T,
        map,
        ll,
        supplements,
        'campus-buildings-3d',
        onBuilding &&
          ((building) => {
            if (!disposed && visible) onBuilding(building);
          }),
      );
      layer?.destroy();
      layer = next;
      signature = nextSignature;
      count = layer ? supplements.length : 0;
      return count;
    },
    preview(building) {
      preview?.destroy();
      preview = null;
      if (building && !disposed) {
        if (!T.ExtrudablePolygonStyle) throw Error('当前地图组件不支持立体建筑');
        preview = buildingLayer(T, map, ll, [building], 'campus-building-review');
      }
    },
    refresh() {
      generation++;
      pending = null;
      loadedAt = 0;
      layer?.destroy();
      layer = null;
      signature = null;
    },
    destroy() {
      disposed = true;
      generation++;
      layer?.destroy();
      layer = null;
      preview?.destroy();
      preview = null;
    },
  };
}
