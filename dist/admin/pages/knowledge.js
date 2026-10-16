import { $, api, esc, field, errorHTML, modal, toast } from '/shared/ui.js';

export function createKnowledgePage() {
  const knowledgePage = () =>
    '<section class="panel" id="knowledge-host"><p role="status">正在载入校园知识库…</p></section>';
  async function bindKnowledge() {
    const host = $('#knowledge-host');
    if (!host) return;
    try {
      const [data, status, catalog] = await Promise.all([
        api('/api/admin/knowledge'),
        api('/api/admin/assistant-status'),
        api('/api/admin/overview'),
      ]);
      if (!host.isConnected) return;
      host.innerHTML = `<h2>校园知识库</h2><p class="muted">已发布地点及审核通过的拍摄建议会自动参与检索。这里可补充校园说明、拍摄须知与常见问题；草稿不会进入用户回答。</p><p class="pill">${status.generationAvailable ? '生成模型已配置' : '资料检索可用 · 生成模型未配置'}</p><div class="settings-grid"><section><input class="search" id="knowledge-search" aria-label="搜索校园知识" placeholder="搜索标题或正文"><div id="knowledge-list"></div><button class="button secondary" id="knowledge-new">新增资料</button></section><section id="knowledge-editor"></section></div>`;
      const list = $('#knowledge-list', host),
        editor = $('#knowledge-editor', host);
      function drawList() {
        const q = $('#knowledge-search', host).value.trim();
        list.innerHTML =
          data.items
            .filter((row) => JSON.stringify(row.draft || {}).includes(q))
            .map(
              (row) =>
                `<button class="button secondary block" data-knowledge="${esc(row.id)}">${esc(row.draft.title)} · ${row.published ? '已发布' : '草稿'}</button>`,
            )
            .join('') || '<p class="muted">暂无匹配资料</p>';
        list
          .querySelectorAll('[data-knowledge]')
          .forEach(
            (button) =>
              (button.onclick = () =>
                edit(data.items.find((row) => row.id === button.dataset.knowledge))),
          );
      }
      function edit(row) {
        const draft = row?.draft || { title: '', body: '', tags: [], pointIds: [], sourceUrl: '' };
        editor.innerHTML = `<form id="knowledge-form">${field('资料标题', 'title', 'text', draft.title, 'required maxlength="80"')}<label>正文<textarea name="body" rows="9" maxlength="6000" required>${esc(draft.body)}</textarea></label>${field('检索标签（用逗号分隔，最多8个）', 'tags', 'text', draft.tags.join('，'), 'maxlength="180"')}<label>关联地点（可多选）<select name="pointIds" multiple size="5">${catalog.points.map((p) => `<option value="${esc(p.id)}" ${draft.pointIds.includes(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>${field('原始资料链接（可选HTTPS）', 'sourceUrl', 'url', draft.sourceUrl, 'maxlength="500"')}${errorHTML}<div class="button-row"><button class="button secondary" value="draft" type="submit">保存草稿</button><button class="button secondary" id="knowledge-preview" type="button">预览</button><button class="button" value="publish" type="submit">发布</button>${row?.published ? '<button class="button danger" value="unpublish" type="submit">下线</button>' : ''}</div></form>`;
        const form = $('#knowledge-form', editor);
        function content() {
          const f = new FormData(form);
          return {
            title: String(f.get('title')),
            body: String(f.get('body')),
            tags: String(f.get('tags'))
              .split(/[,，]/)
              .map((s) => s.trim())
              .filter(Boolean),
            pointIds: f.getAll('pointIds'),
            sourceUrl: String(f.get('sourceUrl')),
          };
        }
        $('#knowledge-preview', editor).onclick = () => {
          const value = content();
          modal(value.title || '知识资料预览', `<p class="site-copy">${esc(value.body)}</p>`);
        };
        form.onsubmit = async (event) => {
          event.preventDefault();
          const buttons = [...form.querySelectorAll('button')];
          buttons.forEach((b) => (b.disabled = true));
          $('.form-error', form).textContent = '';
          try {
            await api('/api/admin/knowledge' + (row ? '/' + row.id : ''), row ? 'PUT' : 'POST', {
              revision: row?.revision || 0,
              action: event.submitter?.value || 'draft',
              content: content(),
            });
            await bindKnowledge();
            toast('知识资料已保存');
          } catch (error) {
            $('.form-error', form).textContent = error.message;
          } finally {
            buttons.forEach((b) => (b.disabled = false));
          }
        };
      }
      $('#knowledge-search', host).oninput = drawList;
      $('#knowledge-new', host).onclick = () => edit(null);
      drawList();
      edit(null);
    } catch (error) {
      if (host.isConnected) host.textContent = error.message;
    }
  }
  return { knowledgePage, bindKnowledge };
}
