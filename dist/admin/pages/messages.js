import { $, api, esc, date, modal, closeModal, formSubmit, errorHTML, toast } from '/shared/ui.js';
import { richHTML, richFields, bindRich } from '/shared/rich-message.js';
export const messagePage = () =>
  '<section id="admin-messages"><p role="status">正在打开消息中心…</p></section>';
const can = (state, mode) => state.account.effectivePermissions?.includes('messages.' + mode);
export function startConversation(state, userId, requestId, after = () => {}) {
  if (!can(state, 'write')) return;
  const user = state.data.users.find((u) => u.id === userId);
  modal(
    '建立联系',
    `<p class="muted">向${esc(user?.nickname || '此用户')}发起对话。用户将收到站内通知，并可在连接内回复。</p><form id="new-conversation"><label>第一条消息<textarea name="body" maxlength="4000" placeholder="你好，我们收到了你的留言…"></textarea></label>${richFields()}${errorHTML}<button type="submit" class="button">建立连接并发送</button></form>`,
    (d) => {
      const form = $('#new-conversation', d),
        rich = bindRich(form),
        submissionId = crypto.randomUUID();
      form.onsubmit = (e) =>
        formSubmit(e, async (f) => {
          const r = await api('/api/admin/conversations', 'POST', {
            userId,
            requestId,
            body: f.body,
            submissionId,
            ...rich(),
          });
          closeModal();
          toast('连接已建立，用户会收到通知');
          location.hash = 'messages/' + r.conversation.id;
          await after();
        });
    },
  );
}
export async function refreshAdminBell() {
  if (document.hidden) return;
  try {
    const data = await api('/api/admin/inbox/summary');
    document.querySelectorAll('[data-admin-unread]').forEach((el) => {
      el.hidden = !data.unread;
      el.textContent = data.unread > 99 ? '99+' : String(data.unread);
    });
  } catch {}
}
export async function bindMessages(state) {
  const host = $('#admin-messages');
  if (!host) return;
  const current = location.hash,
    alive = () => host.isConnected && location.hash === current;
  try {
    const id = current.split('/')[1];
    if (state.page === 'inbox') {
      const data = await api('/api/admin/inbox');
      if (!alive()) return;
      host.innerHTML = `<h2>消息与待办</h2><p class="muted">仅显示你有权限处理的请求。标为已读不会处理或移除待办。</p><div class="message-list">${data.items.map((n) => `<article class="inbox-row ${n.readAt ? '' : 'unread'}"><small>${date(n.createdAt)} · ${n.readAt ? '已读' : '未读'}</small><h3>${esc(n.title)}</h3><p class="message-copy">${esc(n.message)}</p><a class="button secondary" href="${esc(n.target)}" data-admin-notice="${esc(n.id)}">打开对应窗口 ↗</a>${n.requestId && can(state, 'write') ? `<button type="button" class="button" data-connect="${esc(n.userId)}" data-request="${esc(n.requestId)}">回应并建立对话</button>` : ''}<button class="text-btn" data-read-admin="${esc(n.id)}">标为已读</button></article>`).join('') || '<p class="empty">目前没有待处理消息。</p>'}</div>`;
      const mark = async (key) => {
        await api('/api/admin/inbox/read', 'POST', { ids: [key] });
        void refreshAdminBell();
      };
      host.querySelectorAll('[data-admin-notice]').forEach(
        (a) =>
          (a.onclick = () => {
            void mark(a.dataset.adminNotice).catch(() => {});
          }),
      );
      host.querySelectorAll('[data-read-admin]').forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              await mark(b.dataset.readAdmin);
              await bindMessages(state);
            } catch (e) {
              toast(e.message);
            }
          }),
      );
    } else if (!id) {
      const [data, requests] = await Promise.all([
        api('/api/admin/conversations'),
        api('/api/admin/inbox'),
      ]);
      if (!alive()) return;
      host.innerHTML = `<h2>用户联系与私信</h2><p class="muted">用户留言后由管理员建立连接；每个对话仅参与管理员和顶级管理员可查看。</p>${requests.items
        .filter((n) => n.requestId)
        .map(
          (n) =>
            `<article class="inbox-row"><h3>待处理留言</h3><p class="message-copy">${esc(n.message)}</p>${can(state, 'write') ? `<button class="button" data-connect="${esc(n.userId)}" data-request="${esc(n.requestId)}">回应并建立对话</button>` : ''}</article>`,
        )
        .join(
          '',
        )}<div class="message-list">${data.items.map((t) => `<a class="inbox-row" href="#messages/${esc(t.id)}"><strong>${esc(t.userName)}</strong> · ${t.open ? '对话中' : '已关闭'} ${t.unread ? `<span class="pill">${t.unread}条新回复</span>` : ''}</a>`).join('') || '<p class="empty">暂无对话，可从用户账号列表发起。</p>'}</div>`;
    } else {
      const base = '/api/admin/conversations/' + encodeURIComponent(id),
        data = await api(base);
      if (!alive()) return;
      await api(base + '/read', 'POST', {});
      if (!alive()) return;
      host.innerHTML = `<a href="#messages" class="text-btn">← 用户联系</a><h2>${esc(data.conversation.userName)}</h2><button class="button secondary" id="conversation-refresh">刷新消息</button>${can(state, 'write') ? `<button class="text-btn" id="conversation-status">${data.conversation.open ? '关闭对话' : '重新开放对话'}</button>` : ''}${data.next ? '<button class="text-btn" id="conversation-older">查看更早消息</button>' : ''}<div class="message-list">${data.items.map((m) => `<article class="message-bubble from-${m.from}"><small>${m.from === 'admin' ? '管理员' : '用户'} · ${date(m.createdAt)}</small>${richHTML(m)}</article>`).join('')}</div>${can(state, 'write') && data.conversation.open ? `<form class="message-composer" id="admin-message-reply"><label>消息<textarea name="body" maxlength="4000"></textarea></label>${richFields()}${errorHTML}<button type="submit" class="button">发送消息</button></form>` : ''}`;
      $('#conversation-refresh', host).onclick = () => {
        if (
          $('#admin-message-reply [name=body]')?.value ||
          $('#admin-message-reply [name=imageId]')?.value
        ) {
          toast('请先发送或清空正在编辑的消息');
          return;
        }
        void bindMessages(state);
      };
      let cursor = data.next;
      $('#conversation-older', host)?.addEventListener('click', async function () {
        this.disabled = true;
        try {
          const older = await api(base + '?before=' + encodeURIComponent(cursor));
          if (!alive()) return;
          $('.message-list', host).insertAdjacentHTML(
            'afterbegin',
            older.items
              .map(
                (m) =>
                  `<article class="message-bubble from-${m.from}"><small>${m.from === 'admin' ? '管理员' : '用户'} · ${date(m.createdAt)}</small>${richHTML(m)}</article>`,
              )
              .join(''),
          );
          cursor = older.next;
          this.hidden = !cursor;
        } catch (e) {
          toast(e.message);
        } finally {
          this.disabled = false;
        }
      });
      $('#conversation-status', host)?.addEventListener('click', async () => {
        try {
          await api(base, 'PATCH', { open: !data.conversation.open });
          await bindMessages(state);
        } catch (e) {
          toast(e.message);
        }
      });
      const form = $('#admin-message-reply', host);
      if (form) {
        const rich = bindRich(form);
        const submissionId = crypto.randomUUID();
        form.onsubmit = (e) =>
          formSubmit(e, async (f) => {
            await api(base + '/messages', 'POST', { body: f.body, submissionId, ...rich() });
            await bindMessages(state);
          });
      }
    }
    host
      .querySelectorAll('[data-connect]')
      .forEach(
        (b) => (b.onclick = () => startConversation(state, b.dataset.connect, b.dataset.request)),
      );
  } catch (e) {
    if (alive())
      host.innerHTML = `<p role="alert">${esc(e.message)}</p><a href="#inbox">返回消息中心</a>`;
  }
}
