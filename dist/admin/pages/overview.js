import { esc, icon } from '/shared/ui.js';

export function createOverviewPages({ state, badge, userName }) {
  function overview() {
    const can = (feature) => state.account.effectivePermissions?.includes(feature + '.read');
    const s = state.data.summary;
    const actions = [
      ['works', '作品审核', '检查新投稿与内容质量'],
      ['applications', '探索官申请', '处理申请与身份复核'],
      ['points', '校园点位', '维护开放时间与资料'],
      ['announcements', '开屏公告', '调整通知对象和时间'],
      ['passport', '护照与勋章', '维护主题与建筑关联'],
      ['topics', '活动专题', '安排季节与校园活动'],
      ['scout-quiz', '社区规范题库', '维护题目与正确答案'],
      ['invites', '邀请码', '邀请新伙伴加入校园探索'],
    ].filter(([id]) => can(id));
    const metrics = [
      ['points', '已发布点位', s.publishedPoints, 'pin'],
      ['users', '注册用户', s.users, 'people'],
      ['applications', '待审申请', s.pendingApplications, 'shield'],
      ['reports', '待处理反馈', s.pendingReports, 'list'],
    ].filter(([id]) => can(id));
    const pending = [
      ['applications', '探索官申请', s.pendingApplications, '核对申请与社区发布资格'],
      ['points', '社区点位资料', s.communityPoints, '核对新发现的照片与位置'],
      ['reports', '点位问题反馈', s.pendingReports, '确认现场变化并回复处理结果'],
    ].filter(([id]) => can(id));
    const runtime = [
      ['invites', '邀请码注册', `${s.activeInvites ?? 0} 个仍可使用 · ${s.inviteUses ?? 0} 次注册`],
      [
        'content',
        '路线与拍摄任务',
        `${s.activeRoutes ?? 0} 条可用路线 · ${s.approvedTemplates ?? 0} 个审核模板`,
      ],
    ].filter(([id]) => can(id));
    return `<section class="console-intro"><div><h2>校园探索工作台</h2><p>从待办开始，把每一次校园发现照顾好。</p></div></section>
      <div class="quick-actions">${actions.map(([id, title, hint]) => `<a href="#${id}"><strong>${title} ↗</strong><small>${hint}</small></a>`).join('')}</div>
      ${metrics.length ? `<div class="metrics">${metrics.map(([, title, n, glyph]) => `<div class="metric">${icon(glyph)}<span>${title}</span><strong>${n ?? 0}</strong></div>`).join('')}</div>` : ''}
      <div class="dashboard-grid">${pending.length ? `<section class="panel"><h2>待办清单</h2>${pending.map(([id, title, n, hint]) => `<div class="review-row"><div><strong>${title} ${badge(n ?? 0, n ? 'orange' : '')}</strong><p>${hint}</p></div><a class="button secondary small" href="#${id}">查看</a></div>`).join('')}</section>` : ''}
      ${runtime.length ? `<section class="panel"><h2>日常维护</h2>${runtime.map(([id, title, hint]) => `<div class="review-row"><div><strong>${title}</strong><p>${hint}</p></div><a href="#${id}" class="button secondary small">管理</a></div>`).join('')}</section>` : ''}</div>
      ${
        can('content')
          ? `<section class="panel"><h2>最近的探索反馈</h2>${
              (state.data.sessions || [])
                .filter((x) => x.feedback)
                .slice(-6)
                .reverse()
                .map(
                  (x) =>
                    `<div class="review-row"><div><strong>${esc(x.routeName)} · ${esc(userName(x.userId))}</strong><p>${esc(x.feedback)}</p></div><span class="pill">${x.rating || '—'} / 5</span></div>`,
                )
                .join('') || '<p class="muted">暂时还没有新的体验反馈。</p>'
            }<p class="tip">仅显示用户主动提交的反馈；私人照片与精确轨迹保留在用户账号内。</p></section>`
          : ''
      }`;
  }
  return { overview };
}
