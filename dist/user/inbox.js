import { $, api, esc, date, toast } from '/shared/ui.js';
import { safeTarget } from '/shared/rich-message.js';
export const categories = {
  all: '全部',
  review: '审核与处理',
  activity: '活动',
  message: '私信',
  announcement: '公告',
  system: '系统',
};
function row(n) {
  return `<article class="inbox-item ${n.readAt ? '' : 'unread'}"><label class="inbox-selection"><input type="checkbox" data-notice-select="${esc(n.id)}" ${n.readAt ? 'disabled' : ''}>${n.readAt ? '已读' : '未读'} · ${esc(categories[n.category] || '系统')}</label><small>${date(n.createdAt)}</small><h3><a href="#notice/${esc(n.id)}">${esc(n.title)}</a></h3><p>${esc(n.message)}</p><div class="button-row"><a class="text-btn" href="#notice/${esc(n.id)}">查看完整消息 ↗</a>${safeTarget(n.target) && n.target !== '#notifications' ? `<a class="text-btn" href="${esc(safeTarget(n.target))}" ${n.target.startsWith('https:') ? 'target="_blank" rel="noopener noreferrer"' : ''}>打开相关内容 ↗</a>` : ''}</div></article>`;
}
const requests = new WeakMap();
export async function renderInbox(root, alive, category = 'all') {
  const serial = (requests.get(root) || 0) + 1;
  requests.set(root, serial);
  const originalAlive = alive;
  alive = () => originalAlive() && requests.get(root) === serial;
  const result = await api('/api/notifications?category=' + category);
  if (!alive()) return;
  const muted = Date.parse(result.preferences?.mutedUntil || '') > Date.now();
  root.innerHTML = `<a class="text-btn" href="#me">← 我的</a><h1>消息中心</h1><div class="chips" aria-label="通知分类">${Object.entries(
    categories,
  )
    .map(
      ([id, text]) =>
        `<button class="chip ${id === category ? 'active' : ''}" data-category="${id}" aria-pressed="${id === category}">${text}</button>`,
    )
    .join(
      '',
    )}</div><details class="panel"><summary>免打扰 · ${muted ? '已开启' : '已关闭'}</summary><p class="muted">开启后暂停消息角标，消息仍会保存在这里。不会屏蔽管理员单独投放的开屏公告。</p><label>暂停时长<select id="notice-mute"><option value="0">关闭免打扰</option><option value="1">1小时</option><option value="8">8小时</option><option value="24">24小时</option></select></label><button class="button secondary" id="notice-mute-save">确认修改</button>${muted ? `<p>免打扰至 ${date(result.preferences.mutedUntil)}</p>` : ''}</details><div class="button-row"><button class="text-btn" id="notice-refresh">刷新消息</button><button class="button secondary" id="notice-selected" disabled>所选已读</button><button class="text-btn" id="notice-all">当前分类全部已读</button></div><p class="muted" role="status" id="notice-selection-status">未选择通知</p><div class="inbox-list">${result.items.map(row).join('') || '<p class="empty">此分类暂无消息。</p>'}</div><button class="button secondary" id="notice-more" ${result.next ? '' : 'hidden'}>加载更多</button>`;
  const refreshBadge = async () => {
    const s = await api('/api/notifications/summary');
    if (!alive()) return;
    document.querySelectorAll('[data-notification-count]').forEach((el) => {
      el.textContent = s.badge || '';
      el.hidden = !s.badge;
    });
  };
  $('#notice-mute', root).value = muted
    ? Date.parse(result.preferences.mutedUntil) - Date.now() > 8 * 3600000
      ? '24'
      : Date.parse(result.preferences.mutedUntil) - Date.now() > 3600000
        ? '8'
        : '1'
    : '0';
  const run = async (work) => {
    try {
      await work();
      if (alive()) {
        await refreshBadge();
        await renderInbox(root, originalAlive, category);
      }
    } catch (e) {
      if (alive()) toast(e.message);
    }
  };
  const selected = () =>
    [...root.querySelectorAll('[data-notice-select]:checked')].map((el) => el.dataset.noticeSelect);
  $('.inbox-list', root).onchange = (event) => {
    if (selected().length > 100) {
      event.target.checked = false;
      toast('一次最多选择100条消息');
    }
    const count = selected().length;
    $('#notice-selected', root).disabled = !count;
    $('#notice-selection-status', root).textContent = count ? `已选择 ${count} 条` : '未选择通知';
  };
  root
    .querySelectorAll('[data-category]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          void renderInbox(root, originalAlive, b.dataset.category).catch((e) => toast(e.message))),
    );
  $('#notice-refresh', root).onclick = () =>
    void renderInbox(root, originalAlive, category).catch((e) => toast(e.message));
  $('#notice-selected', root).onclick = () =>
    run(() => api('/api/notifications/read', 'POST', { ids: selected() }));
  $('#notice-all', root).onclick = () =>
    run(() => api('/api/notifications/read', 'POST', { all: true, category }));
  $('#notice-mute-save', root).onclick = () =>
    run(() =>
      api('/api/notifications/preferences', 'PATCH', {
        hours: Number($('#notice-mute', root).value),
      }),
    );
  let next = result.next;
  $('#notice-more', root).onclick = async function () {
    this.disabled = true;
    try {
      const more = await api(
        '/api/notifications?category=' + category + '&before=' + encodeURIComponent(next),
      );
      if (!alive()) return;
      $('.inbox-list', root).insertAdjacentHTML('beforeend', more.items.map(row).join(''));
      next = more.next;
      this.hidden = !next;
    } catch (e) {
      if (alive()) toast(e.message);
    } finally {
      this.disabled = false;
    }
  };
}
