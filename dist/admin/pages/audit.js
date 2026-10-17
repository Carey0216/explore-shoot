import { $, esc, api, toast, date } from '/shared/ui.js';
const categories = [
  ['all', '全部分类'],
  ['account', '账号与邀请'],
  ['community', '社区审核'],
  ['content', '点位与任务'],
  ['deletion', '删除与验证'],
  ['security', '权限与密码'],
  ['settings', '个人与服务设置'],
  ['other', '其他操作'],
];
export function createAuditPages({ state, role, table, badge, render }) {
  let revision = 0;
  function auditPage() {
    const f = state.auditFilters,
      planning = f.kind === 'planning';
    const options = (rows, value) =>
      rows
        .map(([v, t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${t}</option>`)
        .join('');
    const events = state.auditEvents || [];
    return `<section class="panel records-panel"><div class="records-heading"><div><h2>记录中心</h2><p>查找操作与路线校验记录</p></div><span class="pill">${state.auditTotal} 条匹配</span></div><div class="filter-tabs records-kinds">${[
      ['audit', '操作记录'],
      ['planning', '路线校验'],
    ]
      .map(
        ([v, t]) =>
          `<button data-record-kind="${v}" class="${f.kind === v ? 'active' : ''}">${t}</button>`,
      )
      .join(
        '',
      )}</div><form id="record-filters" class="record-filters"><label class="record-query">关键词<input name="q" type="search" value="${esc(f.q)}" maxlength="100" placeholder="${planning ? '搜索路线或校验结果' : '搜索操作者、操作、对象或 IP'}"></label>${
      planning
        ? ''
        : `<label>分类<select name="category">${options(categories, f.category)}</select></label><label>操作者<select name="role">${options(
            [
              ['all', '全部操作者'],
              ['owner', '顶级管理员'],
              ['super', '超级管理员'],
              ['normal', '普通管理员'],
              ['user', '用户'],
            ],
            f.role,
          )}</select></label>`
    }<label>开始日期<input name="from" type="date" value="${esc(f.from)}"></label><label>结束日期<input name="to" type="date" value="${esc(f.to)}"></label><div class="button-row"><button class="button" type="submit">查找记录</button><button class="button secondary" type="button" id="records-reset">重置</button></div></form><p class="tip">日期按北京时间筛选。操作记录保留操作者与来源 IP；永久删除记录持续保留。私有照片和精确轨迹不会在此展示。</p><div id="record-results" aria-live="polite">${
      planning
        ? table(
            ['时间', '路线', '结果', '计划 / 预算', '数据版本'],
            events.map(
              (l) =>
                `<tr><td>${date(l.at)}</td><td>${esc(l.route)}</td><td>${badge(l.status)}</td><td>${Number(l.total) || 0} / ${Number(l.budget) || 0} 分钟</td><td>v${Number(l.version) || 0}</td></tr>`,
            ),
          )
        : events
            .map(
              (x) =>
                `<article class="audit-line"><div><span class="pill record-category">${categories.find((c) => c[0] === x.category)?.[1] || '其他操作'}</span><strong>${esc(x.action)}</strong><p class="record-actor">${esc(x.actorName || x.actor || '未记录')} · @${esc(x.actor)} · ${esc(x.actorRole ? (x.actorRole === 'user' ? '用户' : role(x.actorRole)) : '未记录')}</p><small class="audit-metadata">${esc(x.detail || '')}<br>对象 ${esc(x.contentType || '')} / ${esc(x.subject || '—')}<br>操作者 ID ${esc(x.actorId || '—')} · IP ${esc(x.ip || '未记录')}${x.action === '永久删除内容' ? '<br>' + esc(x.cleanupPending ? '照片清理待重试：' + x.cleanupPending + ' 个文件' : '内容及独占照片已清理') : ''}</small></div><time datetime="${esc(x.at)}">${esc(new Date(x.at).toLocaleString('zh-CN', { hour12: false }))}</time></article>`,
            )
            .join('') ||
          '<div class="records-empty">没有找到匹配记录，试试调整关键词或筛选条件。</div>'
    }</div>${state.auditBefore ? '<button class="button secondary audit-load-more" id="audit-more">加载更早记录</button>' : ''}</section>`;
  }
  async function loadAudit(more = false) {
    const id = ++revision,
      filters = { ...state.auditFilters };
    state.auditBusy = true;
    const submit = $('#record-filters [type=submit]'),
      moreButton = $('#audit-more');
    if (submit) {
      submit.disabled = true;
      submit.textContent = '正在查找…';
    }
    if (moreButton) {
      moreButton.disabled = true;
      moreButton.textContent = '正在加载…';
    }
    $('#record-results')?.setAttribute('aria-busy', 'true');
    const params = new URLSearchParams({ ...filters, limit: '50' });
    if (more && state.auditBefore) params.set('before', state.auditBefore);
    try {
      const result = await api('/api/admin/records?' + params);
      if (id !== revision || state.page !== 'audit') return;
      state.auditEvents = more ? [...(state.auditEvents || []), ...result.events] : result.events;
      state.auditBefore = result.nextBefore;
      if (!more) state.auditTotal = result.total;
      render();
    } catch (e) {
      if (id === revision && state.page === 'audit') throw e;
    } finally {
      if (id === revision) {
        state.auditBusy = false;
        if (submit?.isConnected) {
          submit.disabled = false;
          submit.textContent = '查找记录';
        }
        if (moreButton?.isConnected) {
          moreButton.disabled = false;
          moreButton.textContent = '加载更早记录';
        }
        $('#record-results')?.setAttribute('aria-busy', 'false');
      }
    }
  }
  function bindAudit() {
    const safe = (fn) => async () => {
      try {
        await fn();
      } catch (e) {
        toast(e.message);
      }
    };
    document.querySelectorAll('[data-record-kind]').forEach(
      (b) =>
        (b.onclick = safe(async () => {
          state.auditFilters = {
            kind: b.dataset.recordKind,
            category: 'all',
            role: 'all',
            q: '',
            from: '',
            to: '',
          };
          await loadAudit();
        })),
    );
    const form = $('#record-filters');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      state.auditFilters = {
        kind: state.auditFilters.kind,
        category: 'all',
        role: 'all',
        ...Object.fromEntries(new FormData(form)),
      };
      await safe(() => loadAudit())();
    };
    $('#records-reset').onclick = safe(async () => {
      state.auditFilters = {
        kind: state.auditFilters.kind,
        category: 'all',
        role: 'all',
        q: '',
        from: '',
        to: '',
      };
      await loadAudit();
    });
  }
  return { auditPage, loadAudit, bindAudit };
}
