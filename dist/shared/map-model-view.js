// Models live on the provider's map. They never supply destinations, GPS fixes or route paths.
export function tencentMapModels(
  T,
  map,
  { timeout = 12000, endpoint = '/api/maps/map-models', coordinate } = {},
) {
  let disposed = false,
    generation = 0,
    visible = false,
    entries = [],
    request = null;
  const clear = () => {
    request?.abort();
    request = null;
    for (const e of entries) {
      e.finish(false);
      e.model.off('loaded', e.loaded);
      e.model.off('load_failed', e.failed);
      e.model.destroy();
    }
    entries = [];
  };
  const allowed = (url) =>
    typeof url === 'string' &&
    /^\/(?:admin\/)?api\/(?:maps|admin\/campus-map)\/map-models\/clock\/content\.glb$/.test(url);
  async function render(records, id) {
    if (!T.model?.GLTFModel) return { loaded: 0, failed: records.length };
    const waits = [];
    for (const record of records) {
      if (!allowed(record.modelUrl)) continue;
      let e;
      try {
        const placement = modelPlacement(T, map, record, coordinate);
        const model = new T.model.GLTFModel({
          id: 'campus-model-' + record.id,
          map,
          url: record.modelUrl,
          ...placement,
          // No broad mask: roads, real point labels and navigation overlays stay visible.
        });
        e = { model };
        entries.push(e);
        waits.push(
          new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => e.finish(false), timeout);
            e.finish = (success) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              try {
                if (success && !disposed && id === generation && visible) model.show();
                else model.hide();
              } catch {
                success = false;
              }
              e.ready = success;
              resolve(success);
            };
            e.loaded = () => e.finish(true);
            e.failed = () => e.finish(false);
            try {
              model.hide();
              model.on('loaded', e.loaded);
              model.on('load_failed', e.failed);
            } catch {
              e.finish(false);
            }
          }),
        );
      } catch {
        e?.finish?.(false);
        waits.push(Promise.resolve(false));
      }
    }
    const result = await Promise.all(waits);
    if (disposed || id !== generation) return null;
    return { loaded: result.filter(Boolean).length, failed: result.filter((r) => !r).length };
  }
  return {
    async show(active) {
      if (disposed) return null;
      const id = ++generation;
      visible = active;
      // Destroy pending loads as well; late loaded events must not resurrect a hidden scene.
      clear();
      if (!active) return null;
      const controller = new AbortController();
      request = controller;
      const timer = setTimeout(() => controller.abort(), timeout);
      let data;
      try {
        const r = await fetch(endpoint, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!r.ok) throw Error('建筑模型暂不可用');
        data = await r.json();
      } catch (error) {
        if (disposed || id !== generation) return null;
        throw error;
      } finally {
        clearTimeout(timer);
        if (request === controller) request = null;
      }
      if (disposed || id !== generation) return null;
      if (data.coordinateSystem !== 'WGS84' || !Array.isArray(data.models))
        throw Error('模型坐标无效');
      return render(
        data.models.filter((m) => m.published && m.confirmed),
        id,
      );
    },
    async preview(record) {
      if (disposed) return null;
      const id = ++generation;
      visible = true;
      clear();
      return render([record], id);
    },
    destroy() {
      disposed = true;
      generation++;
      clear();
    },
  };
}

// The SDK projects height in metres into its zoom-20 world coordinate system.
// Use that conversion rather than assuming one GLB unit equals one SDK pixel.
export function modelPlacement(T, map, record, coordinate) {
  if (typeof coordinate !== 'function' || typeof map.glLatLngToPosition !== 'function')
    throw Error('地图模型单位换算不可用');
  const position = coordinate(record);
  const ground = map.glLatLngToPosition(new T.LatLng(position.lat, position.lng, 0), 20);
  const metre = map.glLatLngToPosition(new T.LatLng(position.lat, position.lng, 1), 20);
  const factor = Math.abs(metre.z - ground.z);
  const north = map.glLatLngToPosition(
    new T.LatLng(position.lat + 180 / Math.PI / 6378137, position.lng, 0),
    20,
  );
  const horizontal = Math.hypot(north.x - ground.x, north.y - ground.y);
  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    factor > 1000 ||
    !Number.isFinite(horizontal) ||
    horizontal <= 0 ||
    horizontal > 1000 ||
    !Number.isFinite(record.scale) ||
    record.scale < 0.1 ||
    record.scale > 2 ||
    !Number.isFinite(record.heading) ||
    Math.abs(record.heading) > 360 ||
    !Number.isFinite(record.altitude) ||
    record.altitude < -20 ||
    record.altitude > 30
  )
    throw Error('模型比例或朝向无效');
  return {
    position: new T.LatLng(position.lat, position.lng, record.altitude),
    anchor: [0, 0, 0],
    rotation: [0, 0, -record.heading],
    // Tencent uses different horizontal and height projection scales at non-equatorial latitudes.
    // GLB X/Z are horizontal, Y is height, before the SDK's native Y-up conversion.
    scale: [horizontal * record.scale, factor * record.scale, horizontal * record.scale],
    namedAnimationsEnabled: false,
  };
}
