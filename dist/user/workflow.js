import { $, api, esc, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
export function sharePlan(plan) {
  modal(
    '分享这份拍摄计划',
    `<p>生成7天有效的链接，任何持有链接的人都能查看机位与清单名称。不包含你的身份、照片或完成进度；之后修改清单不会改变这份快照。</p><form id="plan-share-form"><label class="check"><input type="checkbox" name="includeComposition">同时公开构图笔记（默认不分享）</label>${errorHTML}<button class="button">生成或更新分享链接</button></form><p id="share-result" class="message-copy"></p><button class="text-btn" id="revoke-plan-share">撤销所有分享链接</button>`,
    (d) => {
      $('#plan-share-form', d).onsubmit = (e) =>
        formSubmit(e, async () => {
          const s = await api('/api/my/plans/' + plan.id + '/share', 'POST', {
            revision: plan.revision,
            includeComposition: $('[name=includeComposition]', d).checked,
          });
          const url = new URL(location.href);
          url.hash = 'shared-plan/' + s.token;
          $('#share-result', d).innerHTML =
            `<a href="${esc(url.href)}">打开分享计划 ↗</a><br><button class="button secondary" id="copy-plan-share">复制链接</button><p class="muted">原有链接已失效；7天后自动到期。</p>`;
          $('#share-result a', d).onclick = () => closeModal();
          $('#copy-plan-share', d).onclick = async () => {
            try {
              await navigator.clipboard.writeText(url.href);
              toast('分享链接已复制');
            } catch {
              $('#share-result', d).append(document.createTextNode(url.href));
            }
          };
        });
      $('#revoke-plan-share', d).onclick = async () => {
        try {
          await api('/api/my/plans/' + plan.id + '/share', 'DELETE', { revision: plan.revision });
          closeModal();
          toast('已撤销分享');
        } catch (e) {
          toast(e.message);
        }
      };
    },
  );
}
export async function mountWorkflow({ state, requireAccount, root, alive }) {
  if (state.page === 'shared-plan') {
    const token = state.placeId,
      s = await api('/api/plan-shares/' + encodeURIComponent(token));
    if (!alive()) return;
    root.innerHTML = `<h1>${esc(s.title)}</h1><p class="muted">分享者主动公开的计划快照 · 仅展示当前仍发布的机位。导入后成为独立清单，完成状态从零开始。</p><div class="stack">${s.items.map((i) => `<article class="panel"><a href="#spot/${esc(i.spotId)}">${esc(i.title)} ↗</a><p>${esc(i.composition)}</p></article>`).join('') || '<p>机位已下线，暂无可导入内容。</p>'}</div><button class="button" id="import-plan" ${s.items.length ? '' : 'disabled'}>保存到我的拍摄清单</button>`;
    const submissionId = crypto.randomUUID();
    $('#import-plan', root).onclick = async function () {
      if (!(await requireAccount())) return;
      this.disabled = true;
      try {
        await api('/api/plan-shares/' + token + '/import', 'POST', { submissionId });
        location.hash = 'plans';
      } catch (e) {
        toast(e.message);
        this.disabled = false;
      }
    };
    return;
  }
  if (!(await requireAccount())) return;
  const [groups, me, catalog] = await Promise.all([
    api('/api/my/collections'),
    api('/api/auth/me'),
    api('/api/catalog'),
  ]);
  if (!alive()) return;
  const points = catalog.points.filter((p) => me.account.bookmarks?.includes(p.id));
  const name = (id) => catalog.points.find((p) => p.id === id)?.name || '地点已下线';
  root.innerHTML = `<a href="#me" class="text-btn">← 我的</a><h1>收藏分组</h1><p class="muted">分组仅自己可见。进入地点详情选择真实机位，即可加入拍摄清单。</p><button class="button" id="new-collection">新建分组</button><div class="stack">${groups.items.map((g) => `<article class="panel"><h2>${esc(g.title)}</h2><div class="button-row">${g.pointIds.map((id) => `<a class="button secondary small" href="#place/${esc(id)}">${esc(name(id))} ↗</a>`).join('') || '<p>暂无收藏地点</p>'}</div><button class="text-btn" data-collection="${g.id}">编辑分组</button></article>`).join('') || '<p class="empty">还没有收藏分组。</p>'}</div>`;
  const edit = (g) =>
    modal(
      g ? '编辑收藏分组' : '新建收藏分组',
      `<form id="collection-form"><label>分组名称<input name="title" maxlength="80" required value="${esc(g?.title || '')}"></label><fieldset><legend>选择已收藏的地点</legend>${points.map((p) => `<label class="check"><input type="checkbox" name="point" value="${esc(p.id)}" ${g?.pointIds.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('') || '<p>先在地点卡片点爱心收藏。</p>'}</fieldset>${errorHTML}<button class="button">保存分组</button>${g ? '<button class="text-btn" type="button" id="delete-collection">删除分组</button>' : ''}</form>`,
      (d) => {
        $('#collection-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api('/api/my/collections' + (g ? '/' + g.id : ''), g ? 'PUT' : 'POST', {
              title: f.title,
              pointIds: [...d.querySelectorAll('[name=point]:checked')].map((el) => el.value),
              ...(g ? { revision: g.revision } : {}),
            });
            closeModal();
            await mountWorkflow({ state, requireAccount, root, alive });
          });
        $('#delete-collection', d)?.addEventListener('click', async () => {
          try {
            await api('/api/my/collections/' + g.id, 'DELETE', { revision: g.revision });
            closeModal();
            await mountWorkflow({ state, requireAccount, root, alive });
          } catch (e) {
            toast(e.message);
          }
        });
      },
    );
  $('#new-collection', root).onclick = () => edit(null);
  root
    .querySelectorAll('[data-collection]')
    .forEach(
      (b) => (b.onclick = () => edit(groups.items.find((g) => g.id === b.dataset.collection))),
    );
}
export async function bindTopicReminders(root, account, requireAccount) {
  let subscribed = new Set();
  if (account) {
    const r = await api('/api/my/topic-reminders');
    subscribed = new Set(r.topicIds);
  }
  root.querySelectorAll('[data-topic-reminder]').forEach((b) => {
    const update = () => {
      b.textContent = subscribed.has(b.dataset.topicReminder) ? '取消活动提醒' : '提醒我参加';
      b.setAttribute('aria-pressed', String(subscribed.has(b.dataset.topicReminder)));
    };
    update();
    b.onclick = async () => {
      if (!(await requireAccount())) return;
      b.disabled = true;
      try {
        const enabled = !subscribed.has(b.dataset.topicReminder);
        await api('/api/my/topic-reminders', 'POST', { topicId: b.dataset.topicReminder, enabled });
        if (enabled) subscribed.add(b.dataset.topicReminder);
        else subscribed.delete(b.dataset.topicReminder);
        update();
        toast(enabled ? '已订阅：开始前一天及开始后，联网时送入消息中心' : '已取消提醒');
      } catch (e) {
        toast(e.message);
      } finally {
        b.disabled = false;
      }
    };
  });
}
