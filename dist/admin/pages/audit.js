import { esc, date, api } from '/shared/ui.js';

// 操作日志与加载分页。业务规则与权限由 Java 接口处理。
export function createAuditPages({ state, role, table, badge, render }) {
  function auditPage() {
    const events = state.auditEvents || state.data.audit.slice().reverse();
    return `<section class="panel"><div class="audit-controls"><h2>管理与社区操作记录</h2><button class="button secondary small" id="audit-filter">${state.auditDeletions ? '查看全部操作' : '只看永久删除'}</button></div><p class="tip">永久删除记录持续保留，可加载更早记录。来源 IP 为服务器实际连接地址；本机访问显示 127.0.0.1，旧记录未采集 IP 时显示「未记录」。</p>${events.map((x) => `<div class="audit-line"><div><strong>${esc(x.action)}</strong> · ${esc(x.actorName || x.actor || '')} (@${esc(x.actor || '')})<small class="audit-metadata">${esc(x.detail || '')}<br>对象 ${esc(x.contentType || '')} / ${esc(x.subject || '')}<br>操作者 ID ${esc(x.actorId || '—')} · ${esc(x.actorRole ? (x.actorRole === 'user' ? '用户' : role(x.actorRole)) : '—')} · IP ${esc(x.ip || '未记录')}${x.action === '永久删除内容' ? '<br>' + esc(x.cleanupPending ? '照片清理待重试：' + x.cleanupPending + ' 个文件' : '内容及独占照片已清理') : ''}</small></div><small><time datetime="${esc(x.at)}">${esc(new Date(x.at).toLocaleString('zh-CN', { hour12: false }))}</time></small></div>`).join('') || '<p class="muted">暂无操作记录。</p>'}${state.auditBefore ? '<button class="button secondary audit-load-more" id="audit-more">加载更早记录</button>' : ''}</section><section class="panel"><h2>路线校验记录</h2>${table(
      ['时间', '路线', '结果', '计划 / 预算', '数据版本'],
      state.data.logs
        .slice()
        .reverse()
        .map(
          (l) =>
            `<tr><td>${date(l.at)}</td><td>${esc(l.route)}</td><td>${badge(l.status)}</td><td>${l.total} / ${l.budget} 分钟</td><td>v${l.version}</td></tr>`,
        ),
    )}</section>`;
  }

  async function loadAudit(more = false) {
    if (state.auditBusy) return;
    state.auditBusy = true;
    try {
      const params = new URLSearchParams({ limit: '50', deletions: String(state.auditDeletions) });
      if (more && state.auditBefore) params.set('before', state.auditBefore);
      const result = await api('/api/admin/audit?' + params);
      state.auditEvents = more ? [...state.auditEvents, ...result.events] : result.events;
      state.auditBefore = result.nextBefore;
      if (state.page === 'audit') render();
    } finally {
      state.auditBusy = false;
    }
  }
  return { auditPage, loadAudit };
}
