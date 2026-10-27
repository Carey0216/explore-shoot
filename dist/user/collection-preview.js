import { $, api, esc, icon } from '/shared/ui.js';
import { atlasHTML } from '/shared/passport-atlas.js';

export function collectionEntry(point = '') {
  return `<a class="atlas-entry812" data-feature="passport" data-collection-preview="${esc(point)}" href="#passport">${icon('jy-passport')}<div><strong>校园收集图</strong><small>每次打卡，让一栋校园建筑亮起来</small></div><span aria-hidden="true">↗</span></a>`;
}
export async function mountCollectionEntries(state) {
  const nodes = [...document.querySelectorAll('[data-collection-preview]')],
    owner = state.account?.id;
  if (!nodes.length || !owner) return;
  try {
    const data = await api('/api/my/passport');
    if (state.account?.id !== owner) return;
    for (const node of nodes) {
      if (!node.isConnected) continue;
      const id = node.dataset.collectionPreview,
        buildings = data.atlas.buildings.filter((b) => b.frame === 'photo'),
        linked = id ? buildings.filter((b) => b.pointIds.includes(id)) : buildings,
        lit = buildings.filter((b) => b.collected).length;
      $('small', node).textContent = id
        ? linked.length
          ? linked.map((b) => b.name + (b.collected ? ' · 已点亮' : ' · 打卡后点亮')).join('，')
          : '留下打卡；这处楼宇的关联正在补充'
        : `已点亮 ${lit} / ${buildings.length} 栋 · 看看下一栋在哪里`;
      if (!id) {
        const mini = document.createElement('span');
        mini.className = 'atlas-entry-map812';
        mini.innerHTML = atlasHTML(data.atlas);
        mini.setAttribute('aria-hidden', 'true');
        mini.querySelectorAll('[tabindex]').forEach((b) => {
          b.removeAttribute('tabindex');
          b.removeAttribute('role');
        });
        node.prepend(mini);
      }
    }
  } catch {
    /* The entry remains useful when progress is temporarily unavailable. */
  }
}
