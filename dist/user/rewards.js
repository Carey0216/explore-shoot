import { modal, $, closeModal, esc } from '/shared/ui.js';
import { badgeURL } from '/shared/badge-presets.js';
import { atlasHTML } from '/shared/passport-atlas.js';

// Events are deltas calculated by Java from a committed checkin, never a client-side unlock.
export function showPassportEvents(events) {
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
    ...(events?.achievements || []).map((x) => ({ ...x, kind: '获得新成就' })),
    ...(!events?.atlas ? events?.buildings || [] : []).map((x) => ({ ...x, kind: '点亮校园建筑' })),
    ...(events?.places || []).map((x) => ({ ...x, kind: '点亮新地点' })),
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
        `<div class="reward-stage">${item.atlas ? `<div class="reward-map812">${atlasHTML(item.atlas, item.buildings[0].id.startsWith('photo:') ? 'photo' : 'plan')}</div><span class="collection-seal812">已点亮</span>` : `<img src="${badgeURL(item.badgePreset)}" alt="${esc(item.title)}勋章">`}<h2>${esc(item.title)}</h2><p>${esc(item.description || '每一步，都值得被记住。')}</p><small>${index} / ${items.length}</small><a class="text-btn" href="#passport" data-reward-map>打开我的校园收集图 ↗</a></div><button id="reward-next" class="button wide">${index < items.length ? '收下，看看下一个' : '收进校园护照'}</button>`,
        (d) => {
          let impact;
          if (item.atlas) {
            const ids = new Set(item.buildings.map((b) => b.id));
            const groups = [...d.querySelectorAll('[data-atlas-building]')];
            const fresh = groups
              .filter((b) => ids.has(b.dataset.atlasBuilding))
              .map((b) => b.getBBox());
            d.querySelectorAll('[data-atlas-building]').forEach((b) => {
              b.removeAttribute('tabindex');
              b.removeAttribute('role');
              if (ids.has(b.dataset.atlasBuilding)) b.classList.add('atlas-land812');
              else {
                const r = b.getBBox();
                if (
                  fresh.some(
                    (f) =>
                      Math.hypot(
                        r.x + r.width / 2 - f.x - f.width / 2,
                        r.y + r.height / 2 - f.y - f.height / 2,
                      ) <
                      Math.max(f.width, f.height) * 2.4,
                  )
                )
                  b.classList.add('atlas-neighbor812');
              }
            });
            document.body.classList.add('collection-impact812');
            impact = setTimeout(() => {
              if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(12);
            }, 350);
          }
          $('[data-reward-map]', d).onclick = () => {
            closeModal();
          };
          $('#reward-next', d).onclick = () => {
            advanced = true;
            next();
          };
          return () => {
            clearTimeout(impact);
            document.body.classList.remove('collection-impact812');
            if (!advanced) resolve();
          };
        },
      );
    };
    next();
  });
}
