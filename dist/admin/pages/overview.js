import { esc, icon } from '/shared/ui.js';

// 管理概览展示。业务规则与权限由 Java 接口处理。
export function createOverviewPages({ state, reports, badge, userName }) {
  function overview() {
    const summary = state.data.summary,
      pending = summary.pendingApplications,
      community = summary.communityPoints,
      reports = summary.pendingReports;
    return `<section class="console-intro"><div><span class="eyebrow">北方民族大学 · 校园探索计划</span><h2>校园探索工作台</h2><p>维护内容，连接探索者，记录试点的每一步。</p></div><a class="button secondary" href="#invites">邀请新伙伴 <span aria-hidden="true">↗</span></a></section><div class="metrics">${[
      [
        '校园点位',
        summary.publishedPoints,
        '已发布 / ' + state.data.points.length + ' 条总记录',
        'pin',
      ],
      ['注册用户', summary.users, '普通注册与邀请码注册', 'people'],
      ['探索官申请', pending, '等待管理员审核', 'shield'],
      ['点位反馈', reports, '等待核实处理', 'list'],
    ]
      .map(
        ([t, n, s, i]) =>
          `<div class="metric">${icon(i)}<span>${t}</span><strong>${n}</strong><small>${s}</small></div>`,
      )
      .join('')}</div><div class="dashboard-grid"><section class="panel"><h2>今天需要看看</h2>${[
      ['探索官申请', pending, '审核后开放社区发布与问题反馈权限', 'applications'],
      ['社区点位认证', community, '即刻发布的社区内容，等待确认资料', 'points'],
      ['点位问题反馈', reports, '审核资料与现场问题，再决定上下线', 'reports'],
    ]
      .map(
        ([t, n, s, p]) =>
          `<div class="review-row"><div><strong>${t} ${badge(n, n ? 'orange' : '')}</strong><p>${s}</p></div><a class="button secondary small" href="#${p}">查看</a></div>`,
      )
      .join(
        '',
      )}</section><section class="panel"><h2>试点运行情况</h2><div class="review-row"><div><strong>邀请码注册</strong><p>${summary.activeInvites} 个邀请码仍可使用 · ${summary.inviteUses} 次成功注册</p></div><a href="#invites" class="button secondary small">管理</a></div><div class="review-row"><div><strong>路线与拍摄任务</strong><p>${summary.activeRoutes} 条可用路线 · ${summary.approvedTemplates} 个审核模板</p></div><a href="#content" class="button secondary small">维护</a></div><div class="review-row"><div><strong>探索记录</strong><p>${summary.explorations} 次探索 · ${summary.completedExplorations} 次完成<br>后台仅显示任务统计，私人照片与精确轨迹保留在用户账号内。</p></div></div></section></div><section class="panel"><h2>最近的探索反馈</h2>${
      state.data.sessions
        .filter((s) => s.feedback)
        .slice(-6)
        .reverse()
        .map(
          (s) =>
            `<div class="review-row"><div><strong>${esc(s.routeName)} · ${esc(userName(s.userId))}</strong><p>${esc(s.feedback)}</p></div><span class="pill">${s.rating || '—'} / 5</span></div>`,
        )
        .join('') || '<p class="muted">目前还没有用户提交体验反馈。</p>'
    }</section>${state.data.legacyArchive ? '<p class="tip">原型版本的匿名体验记录已保留在旧数据文件与备份中，未混入当前账号数据。</p>' : ''}`;
  }
  return { overview };
}
