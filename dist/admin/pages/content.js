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

// 路线与任务维护。业务规则与权限由 Java 接口处理。
export function createContentPages({ state, badge, pointName, table, refresh }) {
  function content() {
    return `<section class="panel"><h2>校园探索路线</h2>${state.data.routes.map((r) => `<div class="content-route"><div><h3>${esc(r.name)} ${badge(r.active ? '可用' : '停用', r.active ? 'green' : '')}</h3><p>${r.points.map(pointName).map(esc).join(' / ')}<br>步行 ${r.walk} 分钟 · ${r.measured ? '已有至少 3 次实走记录' : '估算时间'} · ${r.timings.length} 次实走记录</p></div><div class="button-row"><button class="button secondary small" data-route-edit="${r.id}">校准时间</button><button class="text-btn" data-route-toggle="${r.id}">${r.active ? '停用' : '启用'}</button>${!r.active ? `<button class="text-btn delete-content" data-delete-content="routes" data-content-id="${r.id}">永久删除</button>` : ''}</div></div>`).join('')}</section><section class="panel"><h2>审核拍摄任务模板</h2>${table(
      ['点位 / 模板', '任务步骤', '状态', '操作'],
      state.data.templates.map(
        (t) =>
          `<tr><td><strong>${esc(t.title)}</strong><small>${esc(pointName(t.pointId))}</small></td><td class="wide-cell">${t.steps.map(esc).join('<br>')}</td><td>${badge(t.approved ? '审核通过' : '待审核', t.approved ? 'green' : 'orange')}</td><td><button class="button secondary small" data-template-edit="${t.id}">编辑 / 审核</button>${!t.approved ? `<button class="text-btn delete-content" data-delete-content="templates" data-content-id="${t.id}">永久删除</button>` : ''}</td></tr>`,
      ),
    )}</section>`;
  }

  function routeDialog(r) {
    modal(
      '校准路线时间',
      `<form id="route-form"><p class="muted">${esc(r.name)}</p>${field('计划步行时间（分钟）', 'walk', 'number', r.walk, 'required min="1" max="60" step="0.5"')}${field('补充一次实走时间（选填，分钟）', 'timing', 'number', '', 'min="1" max="60" step="0.5"')}<p class="notice">至少记录 3 次实走时间后，路线标记为已经实走校准。请根据实际记录调整计划步行时间。</p>${r.timings.length ? '<p class="tip">历史记录：' + r.timings.map((x) => x.minutes + ' 分钟（' + date(x.at) + '）').join('、') + '</p>' : ''}${errorHTML}<button class="button wide" type="submit">保存校准</button></form>`,
      (d) => {
        $('#route-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            const b = { walk: Number(f.walk) };
            if (f.timing) b.timing = Number(f.timing);
            await api('/api/admin/routes/' + r.id, 'PATCH', b);
            closeModal();
            await refresh();
            toast('路线时间已保存');
          });
      },
    );
  }

  function templateDialog(t) {
    modal(
      '编辑拍摄任务模板',
      `<form id="template-form"><p class="muted">${esc(pointName(t.pointId))}</p>${field('任务标题', 'title', 'text', t.title, 'required maxlength="100"')}<label>拍摄步骤（每行一条）<textarea name="steps" required maxlength="3000">${esc(t.steps.join('\n'))}</textarea></label><label>审核状态<select name="approved"><option value="true" ${t.approved ? 'selected' : ''}>审核通过</option><option value="false" ${!t.approved ? 'selected' : ''}>暂停使用</option></select></label>${errorHTML}<button class="button wide" type="submit">保存模板</button></form>`,
      (d) => {
        $('#template-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/admin/templates/' + t.id, 'PATCH', {
              title: f.title,
              steps: f.steps
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
              approved: f.approved === 'true',
            });
            closeModal();
            await refresh();
            toast('模板已保存');
          });
      },
    );
  }
  return { content, routeDialog, templateDialog };
}
