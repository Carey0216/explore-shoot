// Lazy display data: switching views never plans a route or changes stored coordinates.
let pending = null;
export function loadBuildings() {
  if (!pending)
    pending = fetch('/api/maps/buildings', { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw Error('建筑图层暂不可用');
        return r.json();
      })
      .then((data) => {
        if (data.coordinateSystem !== 'WGS84' || !Array.isArray(data.buildings))
          throw Error('建筑数据无效');
        return data;
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
  return pending;
}

export function buildingPalette(building) {
  if (building.name.includes('图书馆')) return '#7da7c1';
  if (building.name.includes('楼')) return '#b5a7cf';
  return '#9fb9a5';
}

export function tencentBuildings(T, map, ll, onBuilding) {
  let layer = null,
    disposed = false,
    generation = 0;
  return {
    async show(active) {
      const id = ++generation;
      if (!active) {
        layer?.setVisible(false);
        return null;
      }
      if (layer) {
        layer.setVisible(true);
        return true;
      }
      if (!T.ExtrudablePolygonStyle) throw Error('当前地图组件不支持立体建筑');
      const data = await loadBuildings();
      if (disposed || generation !== id) return null;
      const styles = {},
        geometries = [];
      for (const b of data.buildings) {
        if (!b.id || !Array.isArray(b.footprint) || !Number.isFinite(b.height) || b.height <= 0)
          continue;
        styles[b.id] = new T.ExtrudablePolygonStyle({
          color: buildingPalette(b),
          extrudeHeight: b.height,
          showBorder: true,
          borderColor: '#f2f5fa',
        });
        geometries.push({ id: b.id, styleId: b.id, paths: b.footprint.map(ll) });
      }
      if (!geometries.length) throw Error('暂未取得可用的建筑轮廓');
      layer = new T.MultiPolygon({
        map,
        id: 'campus-buildings-3d',
        styles,
        geometries,
        disableInteractive: !onBuilding,
        zIndex: 5,
        isStopPropagation: true,
      });
      if (onBuilding)
        layer.on('click', (e) => {
          const building = data.buildings.find((b) => b.id === e.geometry?.id);
          if (building && !disposed) onBuilding(building);
        });
      return data;
    },
    destroy() {
      disposed = true;
      generation++;
      layer?.destroy();
      layer = null;
    },
  };
}
