import { modal, $, closeModal, esc } from '/shared/ui.js';
import { badgeURL } from '/shared/badge-presets.js';

// Events are deltas calculated by Java from a committed checkin, never a client-side unlock.
export function showPassportEvents(events) {
  const seen = new Set();
  const items = [
    ...(events?.achievements || []).map((x) => ({ ...x, kind: '获得新成就' })),
    ...(events?.buildings || []).map((x) => ({ ...x, kind: '点亮校园建筑' })),
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
        `<div class="reward-stage"><img src="${badgeURL(item.badgePreset)}" alt="${esc(item.title)}勋章"><h2>${esc(item.title)}</h2><p>${esc(item.description || '每一步，都值得被记住。')}</p><small>${index} / ${items.length}</small></div><button id="reward-next" class="button wide">${index < items.length ? '收下，看看下一个' : '收进校园护照'}</button>`,
        (d) => {
          $('#reward-next', d).onclick = () => {
            advanced = true;
            next();
          };
          return () => {
            if (!advanced) resolve();
          };
        },
      );
    };
    next();
  });
}
