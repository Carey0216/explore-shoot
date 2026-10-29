import { api, esc, modal, closeModal, formSubmit, toast } from '/shared/ui.js';
const en = () => document.documentElement.lang.startsWith('en');
const t = (zh, english) => (en() ? english : zh);
export const taskWorkbenchPage = () =>
  '<section class="panel" id="task-workbench"><p role="status">正在整理工作任务…</p></section>';
export async function bindTaskWorkbench() {
  const host = document.querySelector('#task-workbench');
  if (!host) return;
  const alive = () => host.isConnected;
  try {
    const data = await api('/api/admin/task-workbench');
    if (!alive()) return;
    host.innerHTML = `<h2>${t('这次要完成什么？', 'What do you want to finish?')}</h2><p class="muted">${t('沿着任务完成维护；每一步沿用你的现有权限。', 'Follow a task through the existing tools and permissions.')}</p><div class="task820-grid">${data.tasks.map((task) => `<article class="jy-panel"><h3>${esc(en() ? task.titleEn : task.title)}</h3><ol>${task.steps.map((step) => `<li><a href="#${esc(step.route)}">${esc(en() ? step.titleEn : step.title)} →</a></li>`).join('')}</ol></article>`).join('')}</div><h3>${t('需要复核的内容', 'Content to review')}</h3>${data.reminders.map((r) => `<p><a href="#${esc(r.route)}">${esc(r.title)}</a> · ${esc(en() ? r.reasonEn : r.reason)}</p>`).join('') || `<p class="muted">${t('目前没有过期提醒。', 'No expiry reminders right now.')}</p>`}<h3 id="topic-schedule820">${t('专题发布与定时安排', 'Topic publication and scheduling')}</h3><p class="muted">${t('最多选择20项，先查看修改对比，再确认保存。时间按本机时区输入，保存为统一时间。', 'Select up to 20 topics. Review the changes before saving. Enter dates in your local time zone.')}</p><form data-batch><div class="task820-topics">${data.topics.map((r) => `<label><input type="checkbox" name="topic" value="${esc(r.id)}" ${!data.canEditTopics ? 'disabled' : ''}><span><strong>${esc(r.title)}</strong><small>${esc(r.status)} · ${esc(r.updatedBy || '')} · ${esc(r.updatedAt || '')}</small></span></label>`).join('') || `<p>${t('尚无专题。', 'No topics yet.')}</p>`}</div>${data.canEditTopics ? `<div class="form-grid"><label>${t('操作', 'Action')}<select name="action"><option value="publish">${t('立即展示', 'Publish now')}</option><option value="unpublish">${t('下架', 'Unpublish')}</option><option value="schedule">${t('定时上下架', 'Schedule')}</option><option value="description">${t('统一修改介绍', 'Change descriptions')}</option></select></label><label>${t('上架时间（可留空）', 'Publish at (optional)')}<input type="datetime-local" name="publishAt" min="2000-01-01T00:00" max="9999-12-31T23:59"></label><label>${t('下架时间（可留空）', 'Unpublish at (optional)')}<input type="datetime-local" name="unpublishAt" min="2000-01-01T00:00" max="9999-12-31T23:59"></label></div><label>${t('新介绍', 'New description')}<textarea name="description" maxlength="2000"></textarea></label><p class="form-error" role="alert"></p><button class="button" type="submit">${t('预览修改对比', 'Review changes')}</button>` : ''}</form>`;
    host.querySelectorAll('a[href="#task-workbench"]').forEach(
      (a) =>
        (a.onclick = (e) => {
          e.preventDefault();
          host
            .querySelector('#topic-schedule820')
            .scrollIntoView({ behavior: 'smooth', block: 'start' });
        }),
    );
    host.querySelector('[data-batch]').onsubmit = (e) =>
      formSubmit(e, async (values) => {
        const ids = new FormData(e.target).getAll('topic');
        const payload = {
          items: ids.map((id) => ({ id, revision: data.topics.find((r) => r.id === id).revision })),
          action: values.action,
        };
        if (values.action === 'schedule')
          for (const k of ['publishAt', 'unpublishAt'])
            payload[k] = values[k] ? new Date(values[k]).toISOString() : '';
        if (values.action === 'description') payload.description = values.description;
        const preview = await api('/api/admin/task-workbench/topic-batch/preview', 'POST', payload);
        if (!alive()) return;
        modal(
          t('确认这些修改', 'Confirm these changes'),
          `<p class="muted">${t('保存前会备份原内容。若内容已被其他人修改，需要重新预览。', 'Original content is backed up. Concurrent edits require a new preview.')}</p>${preview.changes
            .map(
              (r) =>
                `<article class="task820-diff"><h3>${esc(r.title)}</h3><dl>${
                  Object.keys(r.after)
                    .filter((k) => r.before[k] !== r.after[k])
                    .map(
                      (k) =>
                        `<dt>${esc({ published: '展示状态', publishAt: '上架时间', unpublishAt: '下架时间', description: '介绍' }[k] || k)}</dt><dd><del>${esc(String(r.before[k]))}</del><br><ins>${esc(String(r.after[k]))}</ins></dd>`,
                    )
                    .join('') || `<p>${t('内容相同', 'No content change')}</p>`
                }</dl></article>`,
            )
            .join(
              '',
            )}<form data-confirm><p class="form-error" role="alert"></p><button class="button wide" type="submit">${t('确认保存', 'Save changes')}</button></form>`,
          (d) => {
            d.querySelector('[data-confirm]').onsubmit = (event) =>
              formSubmit(event, async () => {
                await api('/api/admin/task-workbench/topic-batch/apply', 'POST', {
                  ...payload,
                  confirmation: preview.confirmation,
                });
                closeModal();
                toast(t('已保存并备份', 'Saved and backed up'));
                void bindTaskWorkbench();
              });
          },
        );
      });
  } catch (e) {
    if (alive()) {
      host.innerHTML = `<p role="alert">${esc(e.message)}</p><button class="button secondary">重试 / Retry</button>`;
      host.querySelector('button').onclick = bindTaskWorkbench;
    }
  }
}
