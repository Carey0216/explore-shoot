import { esc, date, icon } from './ui.js';
import { safeTarget } from './rich-message.js';
const kinds = {
  review: ['审核与处理', 'shield'],
  activity: ['活动提醒', 'clock'],
  message: ['联系与对话', 'message'],
  announcement: ['公告', 'book'],
  updates: ['更新日志', 'book'],
  system: ['系统消息', 'bell'],
};
export function noticeCard(n, { admin = false, connect = false, detail = false } = {}) {
  const [label, glyph] = kinds[n.category] || kinds.system,
    target = admin
      ? /^#(?:applications|points|reports|work-reports|works|shooting-spots|messages(?:\/[a-f0-9-]+)?)$/.test(
          String(n.target || ''),
        )
        ? n.target
        : ''
      : safeTarget(n.target),
    unread = !n.readAt;
  const id = esc(n.id),
    title = esc(n.title),
    selection = admin ? 'data-inbox-select' : 'data-notice-select';
  const actions = admin
    ? `${target ? `<a class="notice-action" href="${esc(target)}" data-admin-notice="${id}">打开处理页面 ${icon('arrow')}</a>` : ''}${n.requestId && connect ? `<button type="button" class="button small" data-connect="${esc(n.userId)}" data-request="${esc(n.requestId)}">回应并建立对话</button>` : ''}${unread ? `<button class="text-btn" data-read-admin="${id}">标为已读</button>` : '<span class="notice-read-label">已读</span>'}`
    : `${detail ? '' : `<a class="notice-action" href="#notice/${id}"><span>查看详情</span>${icon('arrow')}</a>`}${target && target !== '#notifications' ? `<a class="notice-action notice-related" href="${esc(target)}" ${target.startsWith('https:') ? 'target="_blank" rel="noopener noreferrer"' : ''}><span>相关内容</span>${icon('arrow')}</a>` : ''}`;
  return `<article class="notice-card ${unread ? 'unread' : ''} ${detail ? 'notice-detail' : ''}" data-notice-card><div class="notice-emblem notice-${esc(n.category || 'system')}" aria-hidden="true">${icon(glyph)}</div><div class="notice-card-body"><div class="notice-meta"><span>${label}${unread ? '<i aria-label="未读"></i>' : ''}</span><time datetime="${esc(n.createdAt)}">${date(n.createdAt)}</time></div>${detail ? `<h1>${title}</h1>` : `<h3>${admin ? title : `<a href="#notice/${id}">${title}</a>`}</h3>`}${n.requester ? `<div class="notice-requester"><span aria-hidden="true">${esc((n.requester.nickname || '?').slice(0, 1))}</span><p><strong>${esc(n.requester.nickname)}</strong><small>${n.requester.username ? '@' + esc(n.requester.username) : '账号已删除'}</small></p></div>` : ''}<p class="notice-copy">${esc(n.message)}</p><footer class="notice-actions">${actions}</footer></div>${!detail ? `<label class="notice-select"><input type="checkbox" ${selection}="${id}" aria-label="选择${title}" ${unread ? '' : 'disabled'}><span class="sr-only">选择通知</span></label>` : ''}</article>`;
}
