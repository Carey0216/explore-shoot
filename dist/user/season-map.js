import { $, esc } from '/shared/ui.js';
import { campusMap } from '/shared/map.js';
import { featureOn, featureVisible, maintenanceMessage } from '/shared/features.js';
const seasons = {
  all: '四季',
  spring: '春日',
  summer: '夏日',
  autumn: '秋叶',
  winter: '冬日',
  blossom: '花期',
  snow: '雪景',
};
export function mountSeasonMap(host, topics, catalog) {
  if (!featureVisible('map')) return;
  const items = topics.filter((t) => Object.hasOwn(seasons, t.theme) && t.points.length);
  host.innerHTML = `<details class="season-map81"><summary>校园季节地图 <span>看校园一年的变化</span></summary><p class="muted">参考日期来自管理员维护的拍摄资料；花期和雪景以当年现场为准。</p><div class="season-filters81">${Object.entries(
    seasons,
  )
    .map(
      ([id, t]) =>
        `<button type="button" data-season="${id}" aria-pressed="${id === 'all'}">${t}</button>`,
    )
    .join(
      '',
    )}</div><div class="map-canvas season-canvas81"></div><div class="season-places81"></div></details>`;
  let map,
    selected = 'all',
    serial = 0;
  const draw = () => {
    const chosen = items.filter((t) => selected === 'all' || t.theme === selected);
    const points = [...new Map(chosen.flatMap((t) => t.points.map((p) => [p.id, p]))).values()];
    map?.setPoints?.(points);
    $('.season-places81', host).innerHTML =
      chosen
        .map(
          (t) =>
            `<article><strong>${esc(t.title)}</strong><small>参考拍摄：${esc(t.referenceDate || '日期待补充')}</small><div>${t.points.map((p) => `<button type="button" data-season-point="${esc(p.id)}">${esc(p.name)} ↗</button>`).join('')}</div><a href="#topic/${esc(t.id)}">查看专题 ↗</a></article>`,
        )
        .join('') || '<p class="muted">这个季节还没有发布资料，管理员补充后会显示在这里。</p>';
    host.querySelectorAll('[data-season-point]').forEach(
      (b) =>
        (b.onclick = () => {
          map?.select?.(b.dataset.seasonPoint);
          $('.season-selection81', host)?.remove();
          const p = points.find((p) => p.id === b.dataset.seasonPoint);
          const a = document.createElement('a');
          a.className = 'season-selection81';
          a.href = '#place/' + encodeURIComponent(p.id);
          a.textContent = p.name + ' · 查看机位 ↗';
          $('.season-places81', host).prepend(a);
        }),
    );
  };
  host.querySelectorAll('[data-season]').forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.season;
        host
          .querySelectorAll('[data-season]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        draw();
      }),
  );
  $('details', host).ontoggle = async (e) => {
    if (!e.target.open) {
      serial++;
      map?.destroy?.();
      map = null;
      return;
    }
    if (map) return;
    if (!featureOn('map')) {
      $('.season-canvas81', host).textContent = maintenanceMessage;
      return;
    }
    const stamp = ++serial;
    const next = await campusMap($('.season-canvas81', host), catalog, {
      onPoint: (id) => {
        const b = host.querySelector(`[data-season-point="${CSS.escape(id)}"]`);
        b?.click();
      },
    });
    if (!host.isConnected || stamp !== serial) {
      next?.destroy?.();
      return;
    }
    map = next;
    draw();
  };
  draw();
  return () => {
    serial++;
    map?.destroy?.();
  };
}
