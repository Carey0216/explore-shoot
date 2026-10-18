import { featureVisible } from './features.js';
import { loadAlternative } from './alternative-sdk.js';
import { alternativeWalking } from './alternative-services.js';
import { toTencent, fromTencent, toBaidu, fromBaidu } from './coordinates.js';
import { campusWalking } from './campus-walking.js';
import { distance } from './routing.js';
export async function alternativeMap(
  element,
  catalog,
  { onPoint, onPick, canPick = () => true, routeStops = [], trail = [] } = {},
) {
  const provider = catalog.map.provider,
    baidu = provider === 'baidu',
    sdk = await loadAlternative(provider, catalog.map),
    convert = baidu ? toBaidu : toTencent,
    inverse = baidu ? fromBaidu : fromTencent,
    name = baidu ? '百度地图' : '高德地图';
  let destroyed = false,
    generation = 0,
    selected = null,
    visible = new Set(catalog.points.map((p) => p.id));
  if (!element.isConnected) return { destroy() {} };
  element.innerHTML = '';
  element.classList.add('tencent-map-root');
  const surface = document.createElement('div');
  surface.className = 'provider-map-surface';
  surface.style.cssText = 'width:100%;height:100%';
  element.append(surface);
  const coord = (p) => {
    const c = convert(p);
    return baidu ? new sdk.Point(c.lng, c.lat) : new sdk.LngLat(c.lng, c.lat);
  };
  const map = baidu
    ? new sdk.Map(surface, { enableRotate: true, enableTilt: true })
    : new sdk.Map(surface, {
        center: coord(catalog.campus.center),
        zoom: 16,
        viewMode: '3D',
        pitch: 0,
        rotation: 0,
        scrollWheel: true,
        zoomEnable: true,
      });
  if (baidu) {
    map.centerAndZoom(coord(catalog.campus.center), 16);
    map.enableScrollWheelZoom(true);
  }
  const overlays = new Set(),
    markers = new Map(),
    sets = { reference: [], navigation: [], track: [], gps: [], picked: [] };
  const add = (overlay) => {
    if (baidu) map.addOverlay(overlay);
    else map.add(overlay);
    overlays.add(overlay);
    return overlay;
  };
  const remove = (overlay) => {
    if (baidu) map.removeOverlay(overlay);
    else map.remove(overlay);
    overlays.delete(overlay);
  };
  const clear = (id) => {
    for (const overlay of sets[id]) remove(overlay);
    sets[id] = [];
  };
  const pin = (color) =>
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 40C12 33 2 22 2 15A14 14 0 0 1 30 15C30 22 20 33 16 40Z" fill="${color}" stroke="white" stroke-width="2.5"/><circle cx="16" cy="15" r="5" fill="white"/></svg>`,
    );
  function marker(p, color) {
    if (baidu)
      return add(
        new sdk.Marker(coord(p), {
          icon: new sdk.Icon(pin(color), new sdk.Size(32, 42), { anchor: new sdk.Size(16, 40) }),
        }),
      );
    return add(
      new sdk.Marker({
        position: coord(p),
        icon: pin(color),
        offset: new sdk.Pixel(-16, -40),
        bubble: false,
      }),
    );
  }
  function paint() {
    for (const [id, overlay] of markers) {
      remove(overlay);
      markers.delete(id);
    }
    for (const p of catalog.points) {
      if (!visible.has(p.id)) continue;
      const m = marker(
        p,
        p.id === selected ? '#347fc7' : p.trust === 'community' ? '#859d65' : '#287962',
      );
      if (baidu)
        m.addEventListener('click', (e) => {
          e.domEvent?.stopPropagation();
          onPoint?.(p.id);
        });
      else m.on('click', () => onPoint?.(p.id));
      markers.set(p.id, m);
    }
  }
  const fit = (points) => {
    if (destroyed || !points.length) return;
    if (baidu) map.setViewport(points.map(coord), { margins: [65, 55, 80, 55] });
    else
      map.setBounds(
        new sdk.Bounds(
          coord({
            lng: Math.min(...points.map((p) => (Array.isArray(p) ? p[0] : p.lng))),
            lat: Math.min(...points.map((p) => (Array.isArray(p) ? p[1] : p.lat))),
          }),
          coord({
            lng: Math.max(...points.map((p) => (Array.isArray(p) ? p[0] : p.lng))),
            lat: Math.max(...points.map((p) => (Array.isArray(p) ? p[1] : p.lat))),
          }),
        ),
        false,
        [65, 55, 80, 55],
      );
  };
  const line = (points, color) =>
    add(
      baidu
        ? new sdk.Polyline(points.map(coord), {
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.9,
          })
        : new sdk.Polyline({
            path: points.map(coord),
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.9,
          }),
    );
  const paintLine = (id, points, color) => {
    clear(id);
    if (points?.length > 1) sets[id].push(line(points, color));
  };
  add(
    baidu
      ? new sdk.Polygon(catalog.campus.boundary.map(coord), {
          strokeColor: '#507482',
          strokeWeight: 2,
          fillOpacity: 0.02,
        })
      : new sdk.Polygon({
          path: catalog.campus.boundary.map(coord),
          strokeColor: '#507482',
          strokeWeight: 2,
          fillOpacity: 0.02,
        }),
  );
  paint();
  const click = (e) => {
    if (!canPick() || !onPick || destroyed) return;
    const p = baidu ? e.latlng : e.lnglat;
    if (p) onPick(inverse({ lng: p.lng ?? p.getLng(), lat: p.lat ?? p.getLat() }));
  };
  if (baidu) map.addEventListener('click', click);
  else map.on('click', click);
  const orientation = document.createElement('div');
  orientation.className = 'map-orientation';
  orientation.innerHTML =
    '<button type="button" class="button secondary map-view-toggle" aria-label="调整地图视角" aria-expanded="false">◈</button><div class="map-view-popover" inert aria-hidden="true"><button class="button secondary" data-view="left" aria-label="向左旋转45度">↶</button><button class="button secondary" data-view="north" aria-label="恢复正北与俯视">N</button><button class="button secondary" data-view="right" aria-label="向右旋转45度">↷</button><button class="button secondary map-view-switch" data-view="pitch" aria-pressed="false">倾斜视角</button></div>';
  const toggle = orientation.querySelector('.map-view-toggle'),
    panel = orientation.querySelector('.map-view-popover');
  const open = (value) => {
    orientation.classList.toggle('is-open', value);
    toggle.setAttribute('aria-expanded', String(value));
    panel.setAttribute('aria-hidden', String(!value));
    panel.inert = !value;
  };
  toggle.onclick = () => open(toggle.getAttribute('aria-expanded') !== 'true');
  let rotation = 0,
    pitch = 0;
  const view = (r, p) => {
    rotation = r;
    if (!featureVisible('map-3d')) p = 0;
    pitch = p;
    dimension.textContent = p ? '2D' : '3D';
    dimension.setAttribute('aria-pressed', String(!!p));
    dimension.setAttribute('aria-label', p ? '切换到平面地图' : '切换到立体地图');
    if (baidu) {
      map.setHeading(r);
      map.setTilt(p);
    } else {
      map.setRotation(r);
      map.setPitch(p);
    }
  };
  const dimension = document.createElement('button');
  dimension.type = 'button';
  dimension.setAttribute('data-feature', 'map-3d');
  dimension.hidden = !featureVisible('map-3d');
  dimension.className = 'button secondary map-dimension-toggle';
  dimension.textContent = '3D';
  dimension.setAttribute('aria-label', '切换到立体地图');
  dimension.setAttribute('aria-pressed', 'false');
  dimension.onclick = () => view(rotation, pitch ? 0 : 55);
  panel.onclick = (e) => {
    const key = e.target.closest('[data-view]')?.dataset.view;
    if (key === 'left' || key === 'right') view(rotation + (key === 'right' ? 45 : -45), pitch);
    if (key === 'north') view(0, 0);
    if (key === 'pitch') {
      view(rotation, pitch ? 0 : 45);
      e.target.setAttribute('aria-pressed', String(!!pitch));
      e.target.textContent = pitch ? '俯视视角' : '倾斜视角';
    }
  };
  const zoom = document.createElement('div');
  zoom.className = 'map-zoom';
  zoom.setAttribute('role', 'group');
  zoom.setAttribute('aria-label', '地图缩放');
  zoom.innerHTML =
    '<button type="button" class="button secondary" data-zoom="1" aria-label="放大地图">+</button><button type="button" class="button secondary" data-zoom="-1" aria-label="缩小地图">−</button>';
  zoom.onclick = (e) => {
    const button = e.target.closest('[data-zoom]');
    if (button) map.setZoom(Math.min(20, Math.max(3, map.getZoom() + Number(button.dataset.zoom))));
  };
  element.append(orientation, zoom, dimension);
  const outside = (e) => {
      if (!orientation.contains(e.target)) open(false);
    },
    escape = (e) => {
      if (e.key === 'Escape') open(false);
    };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape);
  const route = async (start, target, alive) => {
    const leg = await campusWalking(sdk, '', start, target, {
      campus: catalog.campus,
      alive,
      walking: (_sdk, _key, a, b, options) => alternativeWalking(provider, sdk, a, b, options),
    });
    for (const field of ['policyWarning', 'policyNote'])
      if (leg[field]) leg[field] = leg[field].replaceAll('腾讯', name.replace('地图', ''));
    return leg;
  };
  const reference = { legs: [], length: 0, missing: 0, loading: routeStops.length > 1 };
  const referenceReady = (async () => {
    for (let i = 1; i < routeStops.length && !destroyed; i++) {
      const leg = await route(routeStops[i - 1], routeStops[i], () => !destroyed);
      if (destroyed) return reference;
      reference.legs.push(leg);
      if (leg.available) {
        reference.length += leg.length;
        sets.reference.push(line(leg.path, '#5276c7'));
      } else {
        reference.missing++;
        reference.reason = leg.reason;
      }
    }
    reference.loading = false;
    return reference;
  })();
  const overview = () => fit(routeStops.length > 1 ? routeStops : catalog.campus.boundary);
  overview();
  paintLine('track', trail, '#ec6a3a');
  let navLeg = null,
    navAt = 0,
    navTarget = null,
    navigationMode = false;
  return {
    provider,
    reference,
    referenceReady,
    metadata: { provider },
    overview,
    navigationView(active, { follow = true, position = null } = {}) {
      if (destroyed) return;
      const changed = navigationMode !== active;
      navigationMode = active;
      if (active) {
        if (changed) map.setZoom(18);
        if (follow && position) map.panTo(coord(position));
      } else if (changed) fit(navLeg?.available ? navLeg.path : catalog.campus.boundary);
    },
    select(id, { pan = true } = {}) {
      if (destroyed) return;
      selected = id;
      paint();
      const p = catalog.points.find((p) => p.id === id);
      if (p && pan && !destroyed) map.panTo(coord(p));
    },
    focus(id) {
      this.select(id);
    },
    filter(ids) {
      visible = new Set(ids);
      if (!visible.has(selected)) selected = null;
      if (!destroyed) paint();
    },
    pick(p) {
      if (!destroyed) {
        clear('picked');
        if (p) sets.picked.push(marker(p, '#347fc7'));
      }
    },
    trail(points) {
      if (!destroyed) paintLine('track', points, '#ec6a3a');
    },
    locate(p, { follow = true } = {}) {
      if (destroyed) return;
      clear('gps');
      sets.gps.push(marker(p, '#2879ff'));
      if (follow) map.panTo(coord(p));
    },
    async plan(start, target, { fit: shouldFit = true } = {}) {
      const stamp = ++generation;
      if (destroyed) return { available: false, reason: '地图页面已关闭' };
      const leg = await route(start, target, () => !destroyed && stamp === generation);
      if (destroyed || stamp !== generation) return { available: false, reason: '路线请求已取消' };
      paintLine('navigation', leg.available ? leg.path : [], '#5276c7');
      if (leg.available && shouldFit) fit(leg.path);
      navLeg = leg;
      navAt = Date.now();
      navTarget = target;
      return leg;
    },
    async navigation(start, target) {
      if (destroyed) return null;
      if (!start || !target) {
        generation++;
        navLeg = null;
        clear('navigation');
        return null;
      }
      if (
        navLeg?.available &&
        navTarget?.id === target.id &&
        Date.now() - navAt < 15000 &&
        distance(start, navLeg.path[0]) < 50
      )
        return navLeg;
      return this.plan(start, target, { fit: false });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
      orientation.remove();
      dimension.remove();
      zoom.remove();
      for (const overlay of [...overlays]) remove(overlay);
      map.destroy?.();
      surface.remove();
      element.classList.remove('tencent-map-root');
    },
  };
}
