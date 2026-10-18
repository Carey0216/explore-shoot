import { $, api, esc, date, toast, formSubmit, errorHTML } from '/shared/ui.js';
import { richHTML, richFields, bindRich, safeTarget } from '/shared/rich-message.js';
export function mountMessages({ state, requireAccount }) {
  const root = $('#main'),
    owner = state.account?.id;
  let disposed = false,
    timer;
  const alive = () => !disposed && root.isConnected && state.account?.id === owner;
  async function load() {
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
      root.innerHTML = `<article class="notice-detail"><a class="text-btn" href="#notifications">← 消息中心</a><h1>${esc(n.title)}</h1><small>${date(n.createdAt)}</small>${richHTML(n)}${safeTarget(n.target) ? `<a class="button" href="${esc(safeTarget(n.target))}" ${n.target.startsWith('https:') ? 'target="_blank" rel="noopener"' : ''}>查看相关内容 ↗</a>` : ''}</article>`;
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
    root.innerHTML = `<a class="text-btn" href="#contact">← 联系管理员</a><h1>${esc(t.adminName)}</h1><p class="muted">${t.open ? '管理员已为你建立连接，可以在这里回复。' : '此对话已关闭，可返回联系页留言。'}</p><button class="text-btn" id="message-refresh">刷新消息</button>${data.next ? '<button class="text-btn" id="message-older">查看更早消息</button>' : ''}<div class="message-list">${data.items.map((m) => `<article class="message-bubble from-${m.from}"><small>${m.from === 'admin' ? '管理员' : '我'} · ${date(m.createdAt)}</small>${richHTML(m)}</article>`).join('')}</div>${t.open ? `<form id="reply-form" class="message-composer"><label>回复<textarea name="body" maxlength="4000" placeholder="写下你的回复…"></textarea></label>${richFields()}${errorHTML}<button class="button" type="submit">发送回复</button></form>` : ''}`;
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
          older.items
            .map(
              (m) =>
                `<article class="message-bubble from-${m.from}"><small>${m.from === 'admin' ? '管理员' : '我'} · ${date(m.createdAt)}</small>${richHTML(m)}</article>`,
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
    if (t.open) {
      const form = $('#reply-form'),
        rich = bindRich(form);
      let submissionId = crypto.randomUUID();
      form.onsubmit = (e) =>
        formSubmit(e, async (f) => {
          await api(base + '/messages', 'POST', { body: f.body, submissionId, ...rich() });
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
  };
}
