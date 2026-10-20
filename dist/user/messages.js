import { noticeCard } from '/shared/notice-card.js';
import { chatBubble, followConversation } from '/shared/chat.js';
import { bindDraftForm, localDraft } from '/shared/drafts.js';
import { $, api, esc, date, toast, icon, formSubmit, errorHTML } from '/shared/ui.js';
import { richHTML, richFields, bindRich, safeTarget } from '/shared/rich-message.js';
export function mountMessages({ state, requireAccount }) {
  const root = $('#main'),
    owner = state.account?.id;
  let disposed = false,
    timer,
    chatCleanup,
    replyDraft;
  const alive = () => !disposed && root.isConnected && state.account?.id === owner;
  async function load() {
    chatCleanup?.();
    replyDraft?.destroy();
    if (!state.account) {
      root.innerHTML =
        '<div class="empty"><h1>登录后查看消息</h1><button class="button" id="message-login">登录</button></div>';
      $('#message-login').onclick = requireAccount;
      return;
    }
    if (state.page === 'notice') {
      const n = await api('/api/notifications/' + encodeURIComponent(state.placeId));
      if (!alive()) return;
      await api('/api/notifications/read', 'POST', { id: n.id });
      if (!alive()) return;
      root.innerHTML = `<a class="page-back" href="#notifications">‹ 返回消息中心</a><section class="notice-center">${noticeCard({ ...n, readAt: n.readAt || 'read' }, { detail: true })}</section>`;

      return;
    }
    if (state.page === 'contact') {
      const [requests, threads] = await Promise.all([
        api('/api/contact-requests'),
        api('/api/conversations'),
      ]);
      if (!alive()) return;
      root.innerHTML = `<a class="text-btn" href="#me">← 我的</a><h1>联系管理员</h1><p class="muted">先留下一段说明，管理员处理后可为你建立专属对话；你也可以回复已经建立的对话。</p><div>${threads.items.map((t) => `<a class="inbox-row" href="#conversation/${esc(t.id)}"><strong>${esc(t.adminName)} · ${t.open ? '对话中' : '已关闭'}</strong>${t.unread ? `<span class="pill">${t.unread}条新消息</span>` : ''}</a>`).join('')}</div><form id="contact-request" class="message-composer"><label>给管理员留言<textarea name="body" maxlength="2000" required placeholder="遇到了什么问题？也可以告诉我们你的建议。"></textarea></label>${errorHTML}<button class="button" type="submit">提交联系请求</button></form>${requests.items.map((r) => `<article class="inbox-row"><span class="pill">${r.status === 'pending' ? '等待处理' : '已建立连接'}</span><p class="message-copy">${esc(r.body)}</p>${r.conversationId ? `<a href="#conversation/${esc(r.conversationId)}">打开对话 ↗</a>` : ''}</article>`).join('')}`;
      $('#contact-request').onsubmit = (e) =>
        formSubmit(e, async (f) => {
          await api('/api/contact-requests', 'POST', { body: f.body });
          toast('留言已送达，管理员会收到提示');
          await load();
        });
      return;
    }
    const base = '/api/conversations/' + encodeURIComponent(state.placeId),
      data = await api(base);
    if (!alive()) return;
    await api(base + '/read', 'POST', {});
    if (!alive()) return;
    const t = data.conversation;
    root.innerHTML = `<section class="conversation-view"><header class="conversation-header"><a class="page-back" data-context-back href="#contact">← 联系管理员</a><h1>${esc(t.adminName)}</h1><p class="muted" data-chat-sync>${t.open ? '管理员已为你建立连接，可以在这里回复。' : '此对话已关闭，可返回联系页留言。'}</p><button class="text-btn" id="message-refresh">刷新消息</button>${data.next ? '<button class="text-btn" id="message-older">查看更早消息</button>' : ''}</header><div class="message-list" role="log" aria-live="polite">${data.items.map((m) => chatBubble(m, 'user', t)).join('')}</div>${t.open ? `<form id="reply-form" class="message-composer"><div class="chat-input-row"><textarea name="body" aria-label="回复" maxlength="4000" rows="1" placeholder="写下你的回复…"></textarea><button class="chat-send" type="submit" aria-label="发送回复">${icon('send')}</button></div>${richFields()}${errorHTML}</form>` : ''}</section>`;
    chatCleanup = followConversation(root, { base, audience: 'user', thread: t, alive });
    $('#message-refresh').onclick = () => {
      if ($('#reply-form [name=body]')?.value || $('#reply-form [name=imageId]')?.value) {
        toast('请先发送或清空正在编辑的回复');
        return;
      }
      void load().catch((e) => toast(e.message));
    };
    let cursor = data.next;
    $('#message-older')?.addEventListener('click', async function () {
      this.disabled = true;
      try {
        const older = await api(base + '?before=' + encodeURIComponent(cursor));
        if (!alive()) return;
        $('.message-list', root).insertAdjacentHTML(
          'afterbegin',
          older.items.map((m) => chatBubble(m, 'user', t)).join(''),
        );
        cursor = older.next;
        this.hidden = !cursor;
      } catch (e) {
        toast(e.message);
      } finally {
        this.disabled = false;
      }
    });
    if (t.open) {
      const form = $('#reply-form'),
        rich = bindRich(form);
      replyDraft = bindDraftForm(form, localDraft(owner, 'conversation:' + state.placeId), [
        'body',
        'richLinks',
      ]);
      let submissionId = crypto.randomUUID();
      form.onsubmit = (e) =>
        formSubmit(e, async (f) => {
          await api(base + '/messages', 'POST', { body: f.body, submissionId, ...rich() });
          await replyDraft.clear();
          submissionId = crypto.randomUUID();
          await load();
        });
    }
  }
  void load().catch((e) => {
    if (alive())
      root.innerHTML = `<p role="alert">${esc(e.message)}</p><a href="#notifications">返回消息中心</a>`;
  });
  return () => {
    disposed = true;
    clearInterval(timer);
    chatCleanup?.();
    replyDraft?.destroy();
  };
}
