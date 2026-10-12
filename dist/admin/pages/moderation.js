import {
  $,
  esc,
  date,
  api,
  toast,
  modal,
  closeModal,
  formSubmit,
  field,
  errorHTML,
} from '/shared/ui.js';

// 探索官申请、点位审核与反馈处理。业务规则与权限由 Java 接口处理。
export function createModerationPages({
  tabs,
  state,
  userName,
  badge,
  stateText,
  refresh,
  table,
  pointName,
}) {
  function applications() {
    return `${tabs()}${
      state.data.applications
        .filter((x) => state.filter === 'all' || x.status === 'pending')
        .slice()
        .reverse()
        .map(
          (x) =>
            `<article class="review-card"><div class="review-top"><h3>${esc(userName(x.userId))}</h3>${badge(stateText[x.status], x.status === 'pending' ? 'orange' : x.status === 'approved' ? 'green' : '')}</div><div class="review-meta"><span>提交于 ${date(x.at)}</span>${x.reviewedAt ? '<span>审核于 ' + date(x.reviewedAt) + '</span>' : ''}</div><p style="margin-top:18px">${esc(x.reason)}</p>${x.note ? '<p class="notice">审核意见：' + esc(x.note) + '</p>' : ''}${x.status === 'pending' ? `<div class="button-row"><button class="button small" data-application="${x.id}" data-status="approved">通过申请</button><button class="button secondary small" data-application="${x.id}" data-status="rejected">暂不通过</button></div>` : ''}</article>`,
        )
        .join('') || '<div class="empty">没有等待审核的申请。</div>'
    }`;
  }

  function reviewApplication(x, status) {
    modal(
      status === 'approved' ? '通过探索官申请' : '暂不通过申请',
      `<form id="application-form"><p class="muted">${esc(userName(x.userId))}</p><label>审核意见<textarea name="note" maxlength="500" placeholder="给申请者留一句说明…"></textarea></label>${errorHTML}<button class="button wide" type="submit">${status === 'approved' ? '通过并开放发布权限' : '保存审核结果'}</button></form>`,
      (d) => {
        $('#application-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/applications/' + x.id, 'PATCH', { status, note: f.note });
            closeModal();
            await refresh();
            toast('审核结果已同步给用户');
          });
      },
    );
  }

  function points() {
    const list = state.data.points.filter(
      (p) => !state.query || [p.name, p.authorName, p.theme].join(' ').includes(state.query),
    );
    return `<div class="toolbar"><input id="table-search" aria-label="搜索点位" placeholder="搜索点位、主题或发布者" value="${esc(state.query)}"><p class="muted" style="margin:0">社区点位即刻展示，核实后给予认证。</p></div><section class="panel">${table(
      [
        '点位',
        '主题 / 来源',
        '认证状态',
        '发布者',
        ...(state.account.role === 'super' ? ['浏览 / 热度'] : []),
        '展示状态',
        '操作',
      ],
      list.map(
        (p) =>
          `<tr><td><strong>${esc(p.name)}</strong><small>${p.lng.toFixed(6)}, ${p.lat.toFixed(6)}</small></td><td>${esc(p.theme)}<br><small>${esc(p.source)}</small></td><td>${badge(p.trust === 'certified' ? '已经过认证' : p.trust === 'community' ? '社区共创 · 待审核' : '地图资料 · 待核验', p.trust === 'certified' ? 'green' : p.trust === 'community' ? 'orange' : '')}</td><td>${esc(p.authorName || '地图资料')}</td>${state.account.role === 'super' ? `<td><strong>${p.popularity || 0}</strong><small>实际浏览 ${p.viewCount || 0}${p.popularityAdjusted ? ' · 已调整' : ''}</small>${state.account.role === 'super' ? `<button class="text-btn" data-popularity="${p.id}">调整热度</button>` : ''}</td>` : ''}<td>${badge(p.published ? (p.open ? '已上线' : '上线 / 关闭') : '已下线', p.published && p.open ? 'green' : '')}</td><td><div class="button-row"><button class="button secondary small" data-point-edit="${p.id}">编辑 / 审核</button><button class="text-btn" data-point-toggle="${p.id}">${p.published ? '下线' : '上线'}</button>${!p.published ? `<button class="text-btn delete-content" data-delete-content="points" data-content-id="${p.id}">永久删除</button>` : ''}</div></td></tr>`,
      ),
    )}</section>`;
  }

  function editPopularity(p) {
    modal(
      '调整机位热度',
      `<p class="muted">实际详情浏览：${p.viewCount || 0} 次。调整只改变热门排序，不改写实际浏览量；新的详情访问仍会累加。</p><form id="popularity-form">${field('排序热度', 'popularity', 'number', p.popularity || 0, 'required min="0" max="1000000000" step="1"')}<label><input type="checkbox" name="useActual"> 恢复按实际浏览排序</label>${errorHTML}<button class="button wide" type="submit">保存热度</button></form>`,
      (d) => {
        $('#popularity-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api(
              '/api/admin/points/' + p.id + '/popularity',
              'PATCH',
              f.useActual ? { useActual: true } : { popularity: Number(f.popularity) },
            );
            closeModal();
            await refresh();
            toast('机位热度已更新');
          });
      },
    );
  }

  function editPoint(p) {
    modal(
      '编辑与审核点位',
      `<form id="point-edit-form">${p.cover ? '<img class="detail-cover" src="' + esc(p.cover) + '" alt="社区发布者上传照片">' : ''}${field('点位名称', 'name', 'text', p.name, 'required maxlength="60"')}<label>点位介绍<textarea name="description" required maxlength="2000">${esc(p.description)}</textarea></label><label>通行与拍摄条件<textarea name="condition" required maxlength="2000">${esc(p.condition)}</textarea></label>${field('资料来源', 'source', 'text', p.source, 'required maxlength="2000"')}<div class="form-grid">${field('经度（WGS84）', 'lng', 'number', p.lng, 'required step="any"')}${field('纬度（WGS84）', 'lat', 'number', p.lat, 'required step="any"')}</div><div class="form-grid"><label>主题<select name="theme">${['建筑', '自然', '人文', '运动'].map((t) => `<option ${p.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>展示状态<select name="display"><option value="online" ${p.published && p.open ? 'selected' : ''}>上线 / 开放</option><option value="closed" ${p.published && !p.open ? 'selected' : ''}>上线 / 暂时关闭</option><option value="offline" ${!p.published ? 'selected' : ''}>下线</option></select></label></div><label>认证状态<select name="certify"><option value="false">${p.trust === 'certified' ? '保持已经过认证' : '保持现有状态'}</option>${p.trust !== 'certified' ? '<option value="true">资料已核实 · 标记已经过认证</option>' : ''}</select></label>${errorHTML}<button class="button wide" type="submit">保存资料与审核结果</button></form>`,
      (d) => {
        $('#point-edit-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/points/' + p.id, 'PATCH', {
              name: f.name,
              description: f.description,
              condition: f.condition,
              allowed: f.condition,
              source: f.source,
              lng: Number(f.lng),
              lat: Number(f.lat),
              theme: f.theme,
              published: f.display !== 'offline',
              open: f.display === 'online',
              certify: f.certify === 'true',
            });
            closeModal();
            await refresh();
            toast('点位已更新，用户端会同步状态');
          });
      },
    );
  }

  function reports() {
    return `${tabs()}${
      state.data.reports
        .filter((x) => state.filter === 'all' || x.status === 'pending')
        .slice()
        .reverse()
        .map(
          (x) =>
            `<article class="review-card"><div class="review-top"><h3>${esc(pointName(x.pointId))}</h3>${badge(stateText[x.status], x.status === 'pending' ? 'orange' : x.status === 'resolved' ? 'green' : '')}</div><div class="review-meta"><span>${esc(x.category || '点位问题')}</span><span>${esc(userName(x.userId))}</span><span>${date(x.at)}</span></div><p style="margin-top:18px">${esc(x.description)}</p>${x.note ? '<p class="notice">处理说明：' + esc(x.note) + '</p>' : ''}${x.status === 'pending' ? `<div class="button-row"><button class="button small" data-report="${x.id}">处理反馈</button><button class="button secondary small" data-point-edit="${x.pointId}">先编辑点位</button></div>` : ''}</article>`,
        )
        .join('') || '<div class="empty">没有等待处理的点位反馈。</div>'
    }`;
  }

  function reviewReport(r) {
    modal(
      '处理点位反馈',
      `<form id="report-review-form"><p class="muted">${esc(pointName(r.pointId))}</p><p class="notice">${esc(r.description)}</p><label>处理方式<select name="action"><option value="resolve">已核实处理 · 保持展示状态</option><option value="offline">确认存在问题 · 下线点位</option><option value="online">资料已恢复 · 上线点位</option><option value="reject">暂不采纳该反馈</option></select></label><label>处理说明<textarea name="note" maxlength="1000" placeholder="记录核实情况与处理结果…"></textarea></label>${errorHTML}<button class="button wide" type="submit">确认处理</button></form>`,
      (d) => {
        $('#report-review-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/reports/' + r.id, 'PATCH', f);
            closeModal();
            await refresh();
            toast('处理结果已同步给反馈用户');
          });
      },
    );
  }
  return {
    applications,
    reviewApplication,
    points,
    editPopularity,
    editPoint,
    reports,
    reviewReport,
  };
}
