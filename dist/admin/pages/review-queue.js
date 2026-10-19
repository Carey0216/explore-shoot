import { $, api, esc, date, modal, closeModal, toast } from '/shared/ui.js';
const kinds = {
  applications: '探索官申请',
  works: '打卡作品',
  'shooting-spots': '真实机位',
  reports: '点位反馈',
  'work-reports': '作品举报',
};
const states = {
  pending: '待审核',
  approved: '已通过',
  published: '已发布',
  rejected: '未采纳',
  resolved: '已处理',
  all: '全部状态',
};
const views = new Map();
export const reviewQueuePage = () =>
  '<section id="review-queue" aria-live="polite">正在加载审核队列…</section>';
export async function bindReviewQueue(state) {
  const host = $('#review-queue');
  if (!host) return;
  const allowed = Object.keys(kinds).filter((k) =>
    state.account.effectivePermissions?.includes(k + '.read'),
  );
  let filters = views.get(state.account.id) || {
    kind: allowed[0],
    status: 'pending',
    query: '',
    page: 1,
  };
  if (!allowed.includes(filters.kind)) filters.kind = allowed[0];
  const load = async () => {
    views.set(state.account.id, filters);
    host.setAttribute('aria-busy', 'true');
    try {
      const result = await api('/api/admin/review-queue?' + new URLSearchParams(filters));
      if (!host.isConnected) return;
      const canWrite = state.account.effectivePermissions?.includes(filters.kind + '.write');
      host.innerHTML = `<div class="review-filters"><label>审核类型<select id="queue-kind">${allowed.map((k) => `<option value="${k}" ${k === filters.kind ? 'selected' : ''}>${kinds[k]}</option>`).join('')}</select></label><label>处理状态<select id="queue-status">${Object.entries(
        states,
      )
        .map(
          ([id, text]) =>
            `<option value="${id}" ${id === filters.status ? 'selected' : ''}>${text}</option>`,
        )
        .join(
          '',
        )}</select></label><form id="queue-search"><label>搜索<input name="query" maxlength="100" placeholder="搜索当前队列" value="${esc(filters.query)}"></label><button class="button secondary">筛选</button></form></div><div class="queue-toolbar"><label><input type="checkbox" id="queue-all"> 选择本页待审核</label><span>共 ${result.total} 条 · 每页12条</span>${canWrite ? '<button class="button" id="queue-approve">通过 / 处理</button><button class="button secondary" id="queue-reject">暂不采纳</button>' : ''}</div><p role="status" id="queue-status-text">结果已加载，尚未修改。</p><div class="review-cards">${result.items.map((r) => `<article class="review-record"><header><label><input type="checkbox" data-review-id="${esc(r.id)}" ${r.status !== 'pending' ? 'disabled' : ''}> ${esc(r.requester.nickname)}${r.requester.username ? ` <small>@${esc(r.requester.username)}</small>` : ''}</label><span class="pill">${esc(states[r.status] || r.status)}</span></header><small>${date(r.createdAt)}</small>${r.photo ? `<img class="review-photo" src="${esc(r.photo)}" width="360" height="240" loading="lazy" alt="用户主动提交审核的作品">` : ''}<h3>${esc(r.title || r.category || kinds[filters.kind])}</h3><p>${esc(r.reason || r.description || r.caption || r.standDescription || '')}</p>${r.note || r.reviewNote ? `<p class="admin-reply">${esc(r.note || r.reviewNote)}</p>` : ''}</article>`).join('') || '<p class="empty">没有匹配的审核记录。</p>'}</div><nav class="queue-pagination" aria-label="审核分页"><button class="button secondary" id="queue-prev" ${filters.page <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${filters.page} 页</span><button class="button secondary" id="queue-next" ${!result.hasMore ? 'disabled' : ''}>下一页</button></nav>`;
      $('#queue-kind', host).onchange = (e) => {
        filters = { ...filters, kind: e.target.value, page: 1 };
        void load();
      };
      $('#queue-status', host).onchange = (e) => {
        filters = { ...filters, status: e.target.value, page: 1 };
        void load();
      };
      $('#queue-search', host).onsubmit = (e) => {
        e.preventDefault();
        filters = { ...filters, query: new FormData(e.target).get('query').trim(), page: 1 };
        void load();
      };
      $('#queue-prev', host).onclick = () => {
        filters.page--;
        void load();
      };
      $('#queue-next', host).onclick = () => {
        filters.page++;
        void load();
      };
      $('#queue-all', host).onchange = (e) =>
        host
          .querySelectorAll('[data-review-id]:not(:disabled)')
          .forEach((c) => (c.checked = e.target.checked));
      const decide = (action) => {
        const ids = [...host.querySelectorAll('[data-review-id]:checked')].map(
          (x) => x.dataset.reviewId,
        );
        const selected = result.items.filter((r) => ids.includes(r.id));
        if (!selected.length) return toast('先选择待审核记录');
        const target =
          action === 'reject'
            ? '未采纳'
            : filters.kind === 'shooting-spots'
              ? '已发布'
              : filters.kind.endsWith('reports')
                ? '已处理'
                : '已通过';
        modal(
          '核对审核变更',
          `<p>本次将处理 ${selected.length} 条${kinds[filters.kind]}，保存后通知提交人。</p><div class="review-comparison">${selected.map((r) => `<p><strong>${esc(r.requester.nickname)}</strong><span>待审核 → ${target}</span></p>`).join('')}</div><form id="queue-decision"><label>说明（会发送给提交人）<textarea name="note" maxlength="500" rows="3"></textarea></label><p class="form-error" role="alert"></p><p role="status" id="decision-state">尚未保存</p><button class="button" type="submit">确认保存 ${selected.length} 项</button></form>`,
          (d) => {
            const form = $('#queue-decision', d);
            form.onsubmit = async (e) => {
              e.preventDefault();
              const button = $('button[type=submit]', form);
              button.disabled = true;
              $('#decision-state', d).textContent = '正在保存，请稍候…';
              try {
                const saved = await api('/api/admin/review-queue/decide', 'POST', {
                  kind: filters.kind,
                  action,
                  note: new FormData(form).get('note'),
                  items: selected.map(({ id, version }) => ({ id, version })),
                });
                closeModal();
                await load();
                $('#queue-status-text', host).textContent =
                  `已保存 ${saved.count} 项 · ${date(saved.savedAt)}`;
              } catch (error) {
                $('.form-error', form).textContent = error.message;
                $('#decision-state', d).textContent =
                  error.status === 409
                    ? '内容已变化，本批未保存。请关闭并刷新核对。'
                    : '保存未完成，可重试。';
              } finally {
                button.disabled = false;
              }
            };
          },
        );
      };
      $('#queue-approve', host)?.addEventListener('click', () => decide('approve'));
      $('#queue-reject', host)?.addEventListener('click', () => decide('reject'));
    } catch (error) {
      if (host.isConnected)
        host.innerHTML = `<p role="alert">${esc(error.message)}</p><button class="button secondary" id="queue-retry">重新加载</button>`;
      $('#queue-retry', host)?.addEventListener('click', load);
    } finally {
      host.removeAttribute('aria-busy');
    }
  };
  await load();
}
