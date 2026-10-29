import { playAtlasLanding } from '/shared/atlas-landing.js';
import { modal, $, closeModal, esc } from '/shared/ui.js';
import { badgeURL } from '/shared/badge-presets.js';
import { atlasHTML } from '/shared/passport-atlas.js';

// Events are deltas calculated by Java from a committed checkin, never a client-side unlock.
const presentations = new WeakMap();
let delivery = Promise.resolve();
export function showPassportEvents(events) {
  if (!events || typeof events !== 'object') return Promise.resolve();
  if (presentations.has(events)) return presentations.get(events);
  const owner = window.campusAccountScope813;
  const result = delivery.then(async () => {
    while (document.querySelector('dialog[open]') || document.hidden) {
      await new Promise((r) => setTimeout(r, 200));
      if (window.campusAccountScope813 !== owner) return;
    }
    if (window.campusAccountScope813 !== owner) return;
    await playPassportEvents(events);
    document.dispatchEvent(new CustomEvent('campus:passport-presented'));
  });
  presentations.set(events, result);
  delivery = result.catch(() => {});
  return result;
}
export function installPassportEvents() {
  window.addEventListener('campus:passport-events', (e) => {
    if (e.detail.owner === window.campusAccountScope813) void showPassportEvents(e.detail.events);
  });
}
function playPassportEvents(events) {
  const seen = new Set();
  const items = [
    ...(events?.atlas && events?.buildings?.length
      ? [
          {
            id: 'atlas',
            kind: '点亮校园建筑',
            title: events.buildings.map((b) => b.title).join('、'),
            description: '你的这次打卡，已让校园收集图多了一抹颜色。',
            atlas: events.atlas,
            buildings: events.buildings,
          },
        ]
      : []),
    ...(events?.revisit?.atlas && events.revisit.buildings?.length
      ? [
          {
            id: 'revisit',
            kind: '又留下了一次校园足迹',
            title: events.revisit.buildings.map((b) => b.title).join('、'),
            description: '这栋建筑已经点亮。这次打卡也已保存，一起重温建筑落位。',
            atlas: events.revisit.atlas,
            buildings: events.revisit.buildings,
            revisit: true,
          },
        ]
      : []),
    ...(events?.milestones || []).map((x) => ({ ...x, milestoneKind: x.kind, kind: '收集里程碑' })),
    ...(events?.achievements || []).map((x) => ({ ...x, kind: '获得新成就' })),
    ...(!events?.atlas ? events?.buildings || [] : []).map((x) => ({ ...x, kind: '点亮校园建筑' })),
    ...(events?.places || []).map((x) => ({ ...x, kind: '点亮新地点' })),
    ...(events?.recorded &&
    !events.atlas &&
    !events.revisit &&
    !events.places?.length &&
    !events.achievements?.length
      ? [
          {
            id: 'recorded',
            kind: '新的校园足迹',
            title: '这次打卡，已好好收下',
            description: '到校园收集图看看，下一栋可以在哪里点亮。',
            badgePreset: 'badge-02',
          },
        ]
      : []),
  ].filter((x) => {
    const key = x.kind + ':' + x.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!items.length) return Promise.resolve();
  return new Promise((resolve) => {
    let index = 0;
    const next = () => {
      if (index >= items.length) {
        closeModal();
        resolve();
        return;
      }
      const item = items[index++];
      let advanced = false;
      modal(
        item.kind,
        `<div class="reward-stage ${item.milestoneKind ? `growth820-finish ${esc(item.milestoneKind)}` : ''}">${item.atlas ? `<div class="reward-map812">${atlasHTML(item.atlas, item.buildings[0].id.startsWith('photo:') ? 'photo' : 'plan')}</div><span class="collection-seal812">已点亮</span><p data-landing-status role="status">正在准备建筑落位…</p><button class="text-btn" type="button" data-replay-landing>重看落位动画</button>` : `<img src="${badgeURL(item.badgePreset)}" alt="${esc(item.title)}勋章">`}<h2>${esc(item.title)}</h2><p>${esc(item.description || '每一步，都值得被记住。')}</p><small>${index} / ${items.length}</small><a class="text-btn" href="#passport" data-reward-map>打开我的校园收集图 ↗</a></div><button id="reward-next" class="button wide">${index < items.length ? '收下，看看下一个' : '收进校园护照'}</button>`,
        (d) => {
          const stopLanding = item.atlas ? playAtlasLanding(d, item) : () => {};
          $('[data-reward-map]', d).onclick = () => {
            closeModal();
          };
          $('#reward-next', d).onclick = () => {
            advanced = true;
            next();
          };
          return () => {
            stopLanding();
            if (!advanced) resolve();
          };
        },
      );
    };
    next();
  });
}
