import { esc } from '/shared/ui.js';

export function planContext(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.spotIds)) return null;
  return {
    budget: Math.max(6, Math.min(180, Number(value.budget) || 20)),
    preference: String(value.preference || '').slice(0, 300),
    spotIds: value.spotIds.filter((id) => typeof id === 'string').slice(0, 6),
    favorites: value.favorites === true,
    quiet: value.quiet === true,
  };
}
export function planPayload(preview, saved) {
  return {
    title: preview.plan.title,
    items: preview.plan.items.map(({ id, spotId, composition, done, minutes }) => ({
      id,
      spotId,
      composition,
      done,
      minutes,
    })),
    departure: saved?.departure || '',
    checklist: saved?.checklist || {},
    ...(saved?.id ? { revision: saved.revision } : {}),
  };
}
export function chatPlanHTML(preview, saved, dirty = false) {
  if (!preview?.plan || !Array.isArray(preview.plan.items)) return '';
  return `<section class="chat-plan820"><strong>${esc(preview.plan.title)}</strong><ol>${preview.plan.items.map((s) => `<li><a class="support-place-link" href="#spot/${encodeURIComponent(s.spotId)}">${esc(s.title)} ↗</a><small>拍摄约 ${esc(s.minutes)} 分钟</small></li>`).join('')}</ol><p class="chat-plan-basis820">${esc(preview.basis)}<br>${esc(preview.notice)}</p><div class="chat-plan-actions820">${['第二站太远', '换个安静点的', '从我收藏里挑'].map((q) => `<button type="button" data-plan-follow="${q}">${q}</button>`).join('')}</div>${preview.canSave ? `<button type="button" data-plan-save>${saved?.id ? (dirty ? '保存本次调整' : '已保存 · 再次保存') : '保存到拍摄清单'}</button>` : ''}${saved?.id ? '<a href="#plans" class="support-place-link">查看清单 · 导航下一站 ↗</a>' : ''}</section>`;
}
