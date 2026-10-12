import {
  $,
  esc,
  date,
  api,
  icon,
  toast,
  modal,
  closeModal,
  formSubmit,
  errorHTML,
} from '/shared/ui.js';
import { campusMap } from '/shared/map.js';
import { localSearchHTML } from '../search.js';
import { bindDraftForm } from '/shared/drafts.js';

// 私人手记展示与编辑。业务规则与权限由 Java 接口处理。
export function createNotesPages({ state, accountDraft, loadPrivate, loginGate, heading }) {
  function noteDialog(s) {
    modal(
      s.routeName,
      `<p class="muted">${date(s.createdAt)} · ${s.status === 'completed' ? '已完成' : s.status === 'ended' ? '提前结束' : '进行中'}</p>${s.tasks.map((t) => `<div class="detail-info"><b>${esc(t.pointName)} · ${t.status === 'done' ? '已完成' : t.status === 'skipped' ? '已跳过' : '未完成'}</b>${esc(t.title)}${t.reason ? '<p class="muted">' + esc(t.reason) + '</p>' : ''}${t.mediaId ? `<img style="margin-top:12px;border-radius:10px" src="/media/${t.mediaId}" alt="我的探索照片">` : ''}</div>`).join('')}${s.track.length ? '<h3>我走过的轨迹</h3><div id="note-trail" class="map-canvas" style="height:260px;margin-bottom:24px"></div>' : ''}<form id="feedback-form"><label>这次探索怎么样？<select name="rating">${[
        [0, '还没评分'],
        [5, '很喜欢'],
        [4, '不错'],
        [3, '一般'],
        [2, '有待改进'],
        [1, '不太满意'],
      ]
        .map(([v, t]) => `<option value="${v}" ${s.rating === v ? 'selected' : ''}>${t}</option>`)
        .join(
          '',
        )}</select></label><label>写一点感受<textarea name="feedback" maxlength="2000" placeholder="哪一处让你停留了更久？">${esc(s.feedback)}</textarea></label>${errorHTML}<div class="button-row"><button class="button" type="submit">保存感受</button><a class="button secondary" href="/api/sessions/${s.id}/export" download>导出手记</a></div></form><p class="muted" style="margin:20px 0 0">已记录 ${s.track.length} 个轨迹点。导出包含照片，不包含精确位置。</p>`,
      (d) => {
        d.querySelector('.dialog-head h2').setAttribute('data-i18n-skip', '');
        let map;
        const el = $('#note-trail', d);
        if (el)
          campusMap(el, { ...state.catalog, points: [] }, { trail: s.track })
            .then((m) => {
              if (el.isConnected) map = m;
              else m.destroy();
            })
            .catch((e) => toast(e.message));
        const draft = bindDraftForm(
          $('#feedback-form', d),
          accountDraft('note:' + s.id),
          ['rating', 'feedback'],
          {
            emptyLabel:
              s.feedback || s.rating ? '当前感受已提交到账号 · 后续编辑将另存本机草稿' : undefined,
          },
        );
        $('#feedback-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/sessions/' + s.id, 'PATCH', {
              action: 'feedback',
              feedback: f.feedback,
              rating: Number(f.rating),
            });
            await draft.clear().catch(() => {});
            await loadPrivate();
            closeModal();
            toast('感受已保存');
          });
        return () => {
          map?.destroy();
          draft.destroy();
        };
      },
    );
  }

  function notesPage() {
    if (!state.account)
      return loginGate('把探索留下来', '登录后，照片与探索手记会保存到你的账号。');
    return `${heading()}<a class="button secondary" style="margin-bottom:24px" href="#passport">${icon('check')} 查看我的打卡足迹</a>${localSearchHTML('notes-search', '搜索本页探索手记', state.localQuery)}<p id="notes-search-empty" class="page-filter-empty" hidden>没有匹配的手记。</p><div class="stack">${
      [...state.sessions]
        .reverse()
        .map(
          (s) =>
            `<article class="record"><div><h3>${esc(s.routeName)}</h3><p>${date(s.createdAt)} · ${s.completedTasks} 个任务已完成 · ${s.photoCount} 张照片</p></div><div class="button-row"><span class="pill ${s.status === 'completed' ? 'green' : ''}">${s.status === 'completed' ? '已完成' : s.status === 'ended' ? '提前结束' : s.status === 'paused' ? '已暂停' : '探索中'}</span><button class="button secondary small" data-note="${s.id}">翻开手记</button>${['active', 'paused'].includes(s.status) ? '<a href="#active" class="button small">继续</a>' : ''}<button class="text-btn" data-delete-note="${s.id}">删除</button></div></article>`,
        )
        .join('') ||
      '<div class="empty">第一篇手记，从今天的一个小发现开始。<br><a href="#routes" class="button secondary" style="margin-top:16px">开始探索</a></div>'
    }</div>`;
  }
  return { noteDialog, notesPage };
}
