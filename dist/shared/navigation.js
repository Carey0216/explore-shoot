import { providerName, providerCopy, mapConfigured, locationNotice } from '/shared/map-provider.js';
import { $, esc, icon, toast } from './ui.js';
import { guidance } from './guidance.js';
import { mapApps } from './map-apps.js';
import { inCampus } from './map.js';
import { locationFor } from './tencent-location.js';
import { distance, direction, meters } from './routing.js';
let copyCatalog = null;
let context = null,
  watch = null,
  latest = null,
  selected = null,
  generation = 0,
  location = null,
  readingGeneration = 0;
const stops = (s, c) =>
  s.tasks
    .map((t, i) => ({ task: t, point: c.points.find((p) => p.id === t.pointId), number: i + 1 }))
    .filter((x) => x.point);
const next = (s, c) => {
  const all = stops(s, c);
  return (
    all.find((x) => x.point.id === selected && x.task.status === 'pending') ||
    all.find((x) => x.task.status === 'pending')
  );
};
export function navigationPanel(s, c) {
  copyCatalog = c;
  const target = next(s, c);
  return `<h3>这一段，怎么走</h3><div id="trail-map" class="map-canvas" role="region" aria-label="探索路线和实时轨迹"></div><p class="map-legend"><i class="blue"></i>${providerName(context?.c || copyCatalog).replace('地图', '')}规划 <i class="green"></i>前往下一站 <i class="orange"></i>实际轨迹</p><section class="navigation-card"><span class="eyebrow" id="nav-label">${target ? '下一站 · 第 ' + target.number + ' 站' : '这一段已经走完'}</span><h3 id="nav-name">${esc(target?.point.name || '可以收进探索手记了')}</h3><div class="navigation-reading"><span class="navigation-arrow" id="nav-arrow" aria-hidden="true">↑</span><p id="nav-reading" aria-live="polite">开启定位后，显示距离和前进方位</p></div><button class="button wide" id="nav-locate" ${!target || s.status !== 'active' || s.blocked?.length ? 'disabled' : ''}>${icon('pin')} ${watch === null ? '定位并指路' : '停止导航定位'}</button><button class="button secondary wide" data-route-to="${target?.point.id || ''}" id="web-navigation" ${target && !s.blocked?.length ? '' : 'hidden'}>${icon('walk')} 网页内路线规划与导航</button><button class="button secondary wide" id="external-navigation" ${target && !s.blocked?.length ? '' : 'hidden'}>用地图 App / 网页版打开 ↗</button><small>地图朝北，箭头是前进方位。网页内可查看转向步骤与实时导航；手机地图需已安装 App，并在系统浏览器中打开。</small></section><div class="route-stops compact">${stops(
    s,
    c,
  )
    .map(
      (x) =>
        `<button data-nav-stop="${x.point.id}" class="nav-stop ${target?.point.id === x.point.id ? 'selected' : ''}" ${x.task.status !== 'pending' ? 'disabled' : ''}><b>${x.task.status === 'done' ? '✓' : x.task.status === 'skipped' ? '—' : x.number}</b><span>${esc(x.point.name)}</span></button>`,
    )
    .join(
      '',
    )}</div><div class="button-row navigation-tools"><button class="text-btn" id="route-overview">整条路线</button><button class="text-btn" id="nav-focus">看下一站</button></div><p id="walking-distance" class="muted">正在请求${providerName(context?.c || copyCatalog).replace('地图', '')}步行路线…</p><p class="muted navigation-footnote">路线由${providerName(context?.c || copyCatalog).replace('地图', '')}步行服务提供，以现场入口和通行条件为准。${locationNotice(c)}本项目不保存导航位置，轨迹记录需另行开启。</p>`;
}
function showTarget() {
  if (!context) return;
  const { s, c, map } = context,
    target = next(s, c);
  context.target = target;
  if (!$('#nav-name')) return;
  $('#nav-label').textContent = target ? '下一站 · 第 ' + target.number + ' 站' : '这一段已经走完';
  $('#nav-name').textContent = target?.point.name || '可以收进探索手记了';
  $('#external-navigation').hidden = !target || !!s.blocked?.length;
  if (target) {
    $('#external-navigation').onclick = () =>
      mapApps(target.point, latest && latest.accuracy <= 80 ? latest : null, c.map);
    const web = $('#web-navigation');
    if (web) {
      web.dataset.routeTo = target.point.id;
      web.hidden = !!s.blocked?.length;
    }
  } else if ($('#web-navigation')) $('#web-navigation').hidden = true;
  $('#nav-locate').disabled = !target || s.status !== 'active' || !!s.blocked?.length;
  $('#nav-locate').innerHTML = icon('pin') + (watch === null ? ' 定位并指路' : ' 停止导航定位');
  document
    .querySelectorAll('[data-nav-stop]')
    .forEach((b) => b.classList.toggle('selected', b.dataset.navStop === target?.point.id));
  if (!target) {
    map.navigation?.(null);
    $('#nav-reading').textContent = '所有点位已完成或跳过';
    return;
  }
  if (latest) updateNavigation(latest);
  else {
    $('#nav-arrow').style.transform = 'rotate(0deg)';
    $('#nav-reading').textContent = '开启定位后，显示距离和前进方位';
  }
}
export async function updateNavigation(p) {
  const readingId = ++readingGeneration;
  if (!context || !$('#nav-reading')) return;
  latest = p;
  const current = context,
    { c, map, target } = current;
  if (!target) return;
  map.locate(p, { follow: false });
  if (!inCampus(p, c.campus)) {
    map.navigation?.(null);
    $('#nav-reading').textContent = '你目前在校园外。请用步行导航先前往校园。';
    return;
  }
  if (p.accuracy > 80) {
    map.navigation?.(null);
    $('#nav-reading').textContent =
      `定位精度约 ${Math.round(p.accuracy)} 米，暂不能可靠指路，请到室外再试。`;
    return;
  }
  $('#nav-reading').textContent = providerCopy(
    '腾讯正在计算前往下一站的步行路线…',
    context?.c || copyCatalog,
  );
  const leg = await map.navigation?.(p, target.point);
  if (context !== current || readingId !== readingGeneration || !$('#nav-reading')) return;
  const straight = distance(p, target.point);
  const headingPoint = leg?.available
    ? leg.path.find((v) => distance(p, v) > 25) || target.point
    : target.point;
  const bearing = direction(p, headingPoint);
  $('#nav-arrow').style.transform = `rotate(${bearing.bearing}deg)`;
  $('#nav-reading').textContent =
    straight < 40 && p.accuracy < 35
      ? `可能已接近点位 · 直线约 ${meters(straight)}，请确认现场入口。`
      : leg?.available
        ? `${guidance(leg, p, target.point).text} · 绿色路线剩余约 ${meters(leg.lengthWithApproach)}`
        : `点位在${direction(p, target.point).name}方向 · 直线约 ${meters(straight)}，${providerName(context?.c || copyCatalog).replace('地图', '')}路线暂不可用：${leg?.reason || providerCopy('请重试或使用腾讯地图 App', context?.c || copyCatalog)}。`;
}
export function stopNavigation() {
  generation++;
  readingGeneration++;
  if (watch !== null) {
    location?.clearWatch(watch);
    watch = null;
  }
  try {
    context?.map.navigation?.(null);
  } catch {}
  latest = null;
  context = null;
}
export function bindNavigation(s, c, map) {
  if (context?.s.id !== s.id) {
    stopNavigation();
    selected = null;
  }
  if (!next(s, c)) stopNavigation();
  context = { s, c, map };
  location = locationFor(c);
  showTarget();
  const reference = map.reference;
  const showDistance = () => {
    if (context?.map !== map || !$('#walking-distance')) return;
    $('#walking-distance').textContent = reference?.missing
      ? reference.reason ||
        providerCopy('部分腾讯路线不可用，请重试或使用腾讯地图 App。', context?.c || copyCatalog)
      : `${providerName(context?.c || copyCatalog).replace('地图', '')}规划：点位间步行约 ${meters(reference?.length || 0)}`;
  };
  if (reference?.loading) {
    $('#walking-distance').textContent = providerCopy(
      '正在请求腾讯步行路线…',
      context?.c || copyCatalog,
    );
    map.referenceReady?.then(showDistance);
  } else showDistance();
  $('#route-overview').onclick = () => map.overview?.();
  $('#nav-focus').onclick = () => {
    const t = context?.target;
    if (t) map.focus(t.point.id);
  };
  document.querySelectorAll('[data-nav-stop]').forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.navStop;
        showTarget();
        map.focus(selected);
      }),
  );
  $('#nav-locate').onclick = () => {
    if (watch !== null) {
      stopNavigation();
      context = { s, c, map };
      showTarget();
      toast('导航定位已停止');
      return;
    }
    if (!mapConfigured(c)) {
      toast(providerCopy('腾讯地图尚未配置，请联系管理员', context?.c || copyCatalog));
      return;
    }
    const token = ++generation;
    $('#nav-reading').textContent = '正在获取位置，请允许浏览器定位…';
    watch = location.watchPosition(
      (pos) => {
        if (token !== generation || !context || !$('#nav-reading')) return;
        updateNavigation({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          at: pos.timestamp,
        });
      },
      (error) => {
        if (token !== generation) return;
        stopNavigation();
        context = { s, c, map };
        showTarget();
        $('#nav-reading').textContent = error.freshness
          ? error.message
          : error.code === 1
            ? '定位权限未开启，请在浏览器设置中允许；也可以使用地图步行导航。'
            : '暂时无法获取位置，请到室外重试。';
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    showTarget();
    if (!latest) $('#nav-reading').textContent = '正在获取位置，请允许浏览器定位…';
    toast('已请求导航定位，本项目不保存导航位置。' + locationNotice(c));
  };
}
