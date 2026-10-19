import { $, esc, api, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
import { bindDraftForm } from '/shared/drafts.js';

// 点位详情、收藏与反馈入口。业务规则与权限由 Java 接口处理。
export function createPointsPages({ loadPrivate, state, render, requireAccount, accountDraft }) {
  function goNavigate(id) {
    const p = state.catalog.points.find((p) => p.id === id && p.open);
    if (id && !p) {
      toast('这个点位目前不可前往');
      return;
    }
    closeModal();
    state.navTarget = id || null;
    location.hash = 'navigate';
    if (state.page === 'navigate') render();
  }

  function bindPoints(root = document) {
    root
      .querySelectorAll('[data-route-to]')
      .forEach((b) => (b.onclick = () => goNavigate(b.dataset.routeTo)));
    root
      .querySelectorAll('[data-point]')
      .forEach((b) => (b.onclick = () => pointDialog(b.dataset.point)));
    root
      .querySelectorAll('[data-save]')
      .forEach((b) => (b.onclick = () => bookmark(b.dataset.save)));
    root.querySelector('#discover-more')?.addEventListener('click', () => {
      state.discoveryLimit = (state.discoveryLimit || 12) + 12;
      render();
    });
    root.querySelectorAll('[data-theme]').forEach(
      (b) =>
        (b.onclick = () => {
          state.theme = b.dataset.theme;
          state.discoveryLimit = 12;
          render();
        }),
    );
  }

  async function bookmark(id) {
    if (!(await requireAccount())) return;
    try {
      const accountId = state.account.id;
      const result = await api('/api/bookmarks', 'POST', { pointId: id });
      if (state.account?.id !== accountId) return;
      state.account.bookmarks = result.bookmarks;
      await loadPrivate();
      if (state.account?.id !== accountId) return;
      document.querySelectorAll(`[data-save="${id}"]`).forEach((b) => {
        b.classList.toggle('saved', result.bookmarks.includes(id));
        b.setAttribute('aria-label', result.bookmarks.includes(id) ? '取消收藏' : '收藏');
      });
      toast(result.bookmarks.includes(id) ? '已经放进你的收藏' : '已取消收藏');
      if (state.page === 'me') await render();
    } catch (e) {
      toast(e.message);
    }
  }

  function pointDialog(id) {
    closeModal();
    location.hash = 'place/' + encodeURIComponent(id);
  }

  function reportDialog(p) {
    modal(
      '反馈点位问题',
      `<p class="muted">${esc(p.name)} · 反馈会同步到管理后台，由管理员确认后处理。</p><form id="report-form"><label>问题类型<select name="category"><option>位置或资料有误</option><option>暂时无法进入</option><option>拍摄条件变化</option><option>其他问题</option></select></label><label>具体情况<textarea name="description" required minlength="5" maxlength="1000" placeholder="描述现场情况，帮助管理员判断…"></textarea></label>${errorHTML}<button class="button wide" type="submit">提交反馈</button></form>`,
      (d) => {
        const draft = bindDraftForm($('#report-form', d), accountDraft('report:' + p.id), [
          'category',
          'description',
        ]);
        $('#report-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/reports', 'POST', { ...f, pointId: p.id });
            await draft.clear().catch(() => {});
            closeModal();
            toast('反馈已送达管理员');
          });
        return () => draft.destroy();
      },
    );
  }
  return { goNavigate, bindPoints, bookmark, pointDialog, reportDialog };
}
