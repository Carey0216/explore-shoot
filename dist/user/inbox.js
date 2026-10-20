import { noticeCard } from '/shared/notice-card.js';
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
const row = (n) => noticeCard(n);

const requests = new WeakMap();
export async function renderInbox(root, alive, category = 'all') {
  const serial = (requests.get(root) || 0) + 1;
  requests.set(root, serial);
  const originalAlive = alive;
  alive = () => originalAlive() && requests.get(root) === serial;
  const result = await api('/api/notifications?category=' + category);
  if (!alive()) return;
  root.innerHTML = `<section class="notice-center"><a class="page-back" href="#me">‹ 返回我的</a><header class="notice-center-heading"><div><span class="eyebrow">与你有关的新消息</span><h1>消息中心</h1></div><span class="notice-count">${result.unread || 0}<small>未读</small></span></header><div class="chips" aria-label="通知分类">${Object.entries(
    categories,
  )
    .map(
      ([id, text]) =>
        `<button class="chip ${id === category ? 'active' : ''}" data-category="${id}" aria-pressed="${id === category}">${text}</button>`,
    )
    .join(
      '',
    )}</div><div class="notice-toolbar"><button class="text-btn" id="notice-refresh">刷新</button><button class="text-btn" id="notice-select-mode" aria-pressed="false">选择</button><button class="button secondary" id="notice-selected" disabled>所选已读</button><button class="text-btn" id="notice-all">当前分类全部已读</button></div><p class="muted" role="status" id="notice-selection-status">未选择通知</p><div class="inbox-list notice-list">${result.items.map(row).join('') || '<p class="empty">此分类暂无消息。</p>'}</div><button class="button secondary" id="notice-more" ${result.next ? '' : 'hidden'}>加载更多</button></section>`;
  $('#notice-select-mode', root).onclick = function () {
    const selecting = $('.notice-center', root).classList.toggle('selecting');
    this.setAttribute('aria-pressed', String(selecting));
    this.textContent = selecting ? '取消选择' : '选择';
  };
  const refreshBadge = async () => {
    const s = await api('/api/notifications/summary');
    if (!alive()) return;
    document.querySelectorAll('[data-notification-count]').forEach((el) => {
      el.textContent = s.badge || '';
      el.hidden = !s.badge;
    });
  };
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
