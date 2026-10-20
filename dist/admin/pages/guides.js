import { $, api, esc, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
export const guidesPage = () =>
  '<section id="admin-guides"><p role="status">正在打开拍摄指南…</p></section>';
const scenes = { newcomer: '新生入门', break: '课间', evening: '饭后', weekend: '周末' };
export async function bindGuides(state) {
  const root = $('#admin-guides'),
    owner = state.account?.id;
  if (!root) return;
  const alive = () => root.isConnected && state.page === 'guides' && state.account?.id === owner;
  try {
    const data = await api('/api/admin/guides');
    if (!alive()) return;
    const editable = state.account.effectivePermissions.includes('content.write');
    root.innerHTML = `<header class="section-heading"><div><h2>校园拍摄指南</h2><p class="muted">维护新生、课间、饭后与周末指南；不自动创建实测站位或真实样片。</p></div>${editable ? '<button class="button" id="new-guide">新建指南</button>' : ''}</header><div class="admin-guide-list">${data.items.map((g) => `<article class="admin-guide-card"><div><span class="pill">${g.published ? '已发布' : '草稿'}</span><small>${esc(scenes[g.scene])} · ${g.minutes} 分钟</small></div><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p><small>${g.pointIds.length}个关联地点 · 修订${g.revision}</small>${editable ? `<button class="button secondary" data-edit-guide="${g.id}">编辑指南</button>` : ''}</article>`).join('')}</div>`;
    const edit = (g) =>
      modal(
        g ? '编辑拍摄指南' : '新建拍摄指南',
        `<form id="guide-edit"><label>标题<input name="title" maxlength="80" required value="${esc(g?.title || '')}"></label><label>介绍<textarea name="description" maxlength="1000" required>${esc(g?.description || '')}</textarea></label><div class="form-two"><label>场景<select name="scene">${Object.entries(
          scenes,
        )
          .map(
            ([id, label]) =>
              `<option value="${id}" ${g?.scene === id ? 'selected' : ''}>${label}</option>`,
          )
          .join(
            '',
          )}</select></label><label>建议分钟<input type="number" name="minutes" min="5" max="180" value="${g?.minutes || 20}" required></label></div><label>关联地点，按展示顺序选择<select name="pointIds" multiple size="6" aria-label="关联地点">${state.data.points.map((p) => `<option value="${esc(p.id)}" ${g?.pointIds.includes(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><small>最多8个；若需自定义顺序，可在下方填写地点编号。</small></label><label>地点编号顺序（每行一个）<textarea name="orderedPoints" rows="3" placeholder="可留空，使用上方所选地点顺序">${esc((g?.pointIds || []).join('\n'))}</textarea></label><label>拍摄步骤（每行一条，最多8条）<textarea name="steps" rows="6" maxlength="4007" required>${esc((g?.steps || []).join('\n'))}</textarea></label><label class="check"><input type="checkbox" name="published" ${g?.published ? 'checked' : ''}>发布给用户</label><p class="muted">站位、开放时间与路线事实需要依据；通用手机构图建议请与现场核验资料区分。</p>${errorHTML}<button class="button wide" type="submit">保存指南</button></form>`,
        (dialog) => {
          $('#guide-edit', dialog).onsubmit = (event) =>
            formSubmit(event, async (f) => {
              const form = event.currentTarget,
                pointIds = f.orderedPoints.trim()
                  ? f.orderedPoints.trim().split(/\s+/)
                  : [...form.elements.pointIds.selectedOptions].map((o) => o.value);
              await api('/api/admin/guides' + (g ? '/' + g.id : ''), g ? 'PUT' : 'POST', {
                title: f.title,
                description: f.description,
                scene: f.scene,
                minutes: Number(f.minutes),
                pointIds,
                steps: f.steps
                  .split('\n')
                  .map((v) => v.trim())
                  .filter(Boolean),
                published: form.elements.published.checked,
                ...(g ? { revision: g.revision } : {}),
              });
              closeModal();
              toast('指南已保存' + (form.elements.published.checked ? '并发布' : ''));
              if (alive()) await bindGuides(state);
            });
        },
      );
    $('#new-guide', root)?.addEventListener('click', () => edit(null));
    root
      .querySelectorAll('[data-edit-guide]')
      .forEach(
        (b) => (b.onclick = () => edit(data.items.find((g) => g.id === b.dataset.editGuide))),
      );
  } catch (error) {
    if (alive())
      root.innerHTML = `<p role="alert">${esc(error.message)}</p><button class="button secondary" id="guides-retry">重试</button>`;
    $('#guides-retry', root)?.addEventListener('click', () => void bindGuides(state));
  }
}
