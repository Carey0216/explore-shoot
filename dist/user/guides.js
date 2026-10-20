import { $, api, esc, icon, thumbnail } from '/shared/ui.js';
import { openPlanPreview } from './plan-preview.js';
export const guideScenes = {
  all: '全部',
  newcomer: '新生入门',
  break: '课间15分钟',
  evening: '饭后散步',
  weekend: '周末慢拍',
};
export function guideCards(items, scene = 'all') {
  return items
    .filter((g) => scene === 'all' || g.scene === scene)
    .map(
      (g) =>
        `<a class="guide-card" href="#guide/${esc(g.id)}"><span class="guide-symbol" aria-hidden="true">${icon(g.scene === 'break' ? 'clock' : g.scene === 'weekend' ? 'camera' : 'walk')}</span><div><small>${esc(guideScenes[g.scene])} · ${g.minutes}分钟安排</small><h2>${esc(g.title)}</h2><p>${esc(g.description)}</p><span class="guide-card-tail">${g.points.length}处可浏览地点 <b>↗</b></span></div></a>`,
    )
    .join('');
}
export async function mountGuides({ root, state, alive }) {
  const data = await api('/api/guides');
  if (!alive()) return;
  const guide = state.page === 'guide' ? data.items.find((g) => g.id === state.placeId) : null;
  if (state.page === 'guide' && !guide) {
    root.innerHTML =
      '<a class="page-back" href="#guides">‹ 返回指南</a><p class="empty">这份指南已下线或暂不可用。</p>';
    return;
  }
  if (!guide) {
    root.innerHTML = `<header class="guide-heading"><span class="eyebrow">发现身边，拍好一张</span><h1>校园拍摄指南</h1><p>从一个角落开始，把今天的校园收进镜头。</p></header><nav class="content-tabs guide-tabs" aria-label="拍摄场景">${Object.entries(
      guideScenes,
    )
      .map(
        ([id, name]) =>
          `<button data-no-liquid data-guide-scene="${id}" aria-pressed="${id === (state.guideScene || 'all')}" class="${id === (state.guideScene || 'all') ? 'active' : ''}">${name}</button>`,
      )
      .join(
        '',
      )}</nav><section class="guide-list" id="guide-list">${guideCards(data.items, state.guideScene || 'all')}</section><p class="muted guide-footnote">路线时长是安排建议，不包含从当前位置到首站和返程的实际时间；请以导航、学校规定和现场情况为准。</p>`;
    root.querySelectorAll('[data-guide-scene]').forEach(
      (b) =>
        (b.onclick = () => {
          state.guideScene = b.dataset.guideScene;
          root.querySelectorAll('[data-guide-scene]').forEach((x) => {
            x.classList.toggle('active', x === b);
            x.setAttribute('aria-pressed', String(x === b));
          });
          $('#guide-list', root).innerHTML = guideCards(data.items, state.guideScene);
        }),
    );
    return;
  }
  root.innerHTML = `<a class="page-back" href="#guides">‹ 返回指南</a><article class="guide-detail"><header class="guide-heading"><span class="guide-scene">${esc(guideScenes[guide.scene])}</span><h1>${esc(guide.title)}</h1><p>${esc(guide.description)}</p><small>建议留出 ${guide.minutes} 分钟 · 可按实际情况删减</small></header><section class="guide-section"><h2>先这样安排</h2><ol class="guide-steps">${guide.steps.map((step, i) => `<li><span>${i + 1}</span><p>${esc(step)}</p></li>`).join('')}</ol></section><section class="guide-section"><h2>沿途看看，现场练一练</h2>${guide.points.map((p, i) => `<article class="guide-place"><div class="guide-place-title"><span class="stop-number">${i + 1}</span><div><a href="#place/${esc(p.id)}"><h3>${esc(p.name)} ↗</h3></a><small>${p.open ? '当前地点可浏览' : '地点暂时关闭，请调整安排'}</small></div></div>${p.cover ? `<img src="${esc(thumbnail(p.cover))}" width="480" height="300" alt="${esc(p.name)}地点配图" loading="lazy">` : ''}<div class="phone-tip"><span>${icon('camera')}</span><div><strong>手机现场练习</strong><p>${esc(p.phoneTip)}</p><small>通用构图练习 · 具体站位请查看已发布真实机位</small></div></div><a class="button secondary small" href="#place/${esc(p.id)}">查看地点与真实机位</a></article>`).join('') || '<p class="empty">关联地点暂不可用，等待管理员补充。</p>'}</section><aside class="guide-notice">${esc(guide.notice)}</aside><button class="button wide" id="guide-to-plan">${icon('camera')} 预览拍摄清单</button></article>`;
  $('#guide-to-plan', root).onclick = () =>
    openPlanPreview({ guideId: guide.id, budget: guide.minutes }, state.account);
}
