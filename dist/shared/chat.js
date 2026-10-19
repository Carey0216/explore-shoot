import { $, api, esc, date, icon } from './ui.js';
import { richHTML } from './rich-message.js';

export function chatBubble(message, audience, thread) {
  const mine = message.from === audience;
  const name = message.from === 'admin' ? thread.adminName : thread.userName;
  const readAt = thread[audience === 'admin' ? 'userReadAt' : 'adminReadAt'];
  const read = mine && readAt && message.createdAt <= readAt;
  return `<div class="chat-row ${mine ? 'outgoing' : 'incoming'}" data-chat-message="${esc(message.id)}"><span class="chat-avatar" aria-hidden="true">${icon(message.from === 'admin' ? 'shield' : 'user')}</span><article class="message-bubble from-${esc(message.from)}"><small>${esc(mine ? '我' : name || '对方')} · ${date(message.createdAt)}</small>${richHTML(message)}${mine ? `<span class="chat-receipt" data-sent-at="${esc(message.createdAt)}">${read ? '已读' : '已发送'}</span>` : ''}</article></div>`;
}

// Only the history changes while polling; typed replies and selected attachments stay intact.
export function followConversation(root, { base, audience, thread, alive }) {
  const list = $('.message-list', root);
  const view = list.closest('.conversation-view');
  const fit = () => {
    if (!view?.isConnected) return;
    const height = window.visualViewport?.height || innerHeight;
    const dock = document.querySelector(audience === 'admin' ? '.admin-dock' : '#mobile-nav');
    const dockBox = dock?.getBoundingClientRect();
    const bottom =
      dockBox?.height && getComputedStyle(dock).display !== 'none'
        ? Math.min(height - 12, dockBox.top - 12)
        : height - 12;
    view.style.height =
      Math.max(120, bottom - Math.max(0, view.getBoundingClientRect().top)) + 'px';
  };
  const resize = new ResizeObserver(fit);
  resize.observe(view.querySelector('.conversation-header'));
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
  fit();
  list.scrollTop = list.scrollHeight;
  let followBottom = true;
  const onScroll = () => {
    followBottom = list.scrollHeight - list.clientHeight - list.scrollTop < 100;
  };
  const onImage = () => {
    if (followBottom) list.scrollTop = list.scrollHeight;
  };
  list.addEventListener('scroll', onScroll);
  list.addEventListener('load', onImage, true);
  let busy = false,
    disposed = false;
  const refresh = async () => {
    if (busy || disposed || !alive() || document.hidden) return;
    busy = true;
    try {
      const data = await api(base);
      if (disposed || !alive()) return;
      const bottom = list.scrollHeight - list.clientHeight - list.scrollTop < 100;
      const ids = new Set(
        [...list.querySelectorAll('[data-chat-message]')].map((x) => x.dataset.chatMessage),
      );
      const fresh = data.items.filter((m) => !ids.has(m.id));
      if (fresh.length)
        list.insertAdjacentHTML(
          'beforeend',
          fresh.map((m) => chatBubble(m, audience, data.conversation)).join(''),
        );
      const readAt = data.conversation[audience === 'admin' ? 'userReadAt' : 'adminReadAt'];
      list.querySelectorAll('[data-sent-at]').forEach((el) => {
        if (readAt && el.dataset.sentAt <= readAt) el.textContent = '已读';
      });
      if (fresh.some((m) => m.from !== audience)) await api(base + '/read', 'POST', {});
      if (bottom && fresh.length) list.scrollTop = list.scrollHeight;
      const status = $('[data-chat-sync]', root);
      if (status) status.textContent = data.conversation.open ? '连接已建立' : '对话已关闭';
      if (!data.conversation.open)
        root
          .querySelectorAll('.message-composer textarea,.message-composer button[type=submit]')
          .forEach((el) => (el.disabled = true));
    } catch {
      const status = $('[data-chat-sync]', root);
      if (status) status.textContent = '连接暂时中断，草稿保留，正在重试…';
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => {
    if (!alive()) dispose();
    else void refresh();
  }, 8000);
  const dispose = () => {
    disposed = true;
    clearInterval(timer);
    resize.disconnect();
    window.removeEventListener('resize', fit);
    window.visualViewport?.removeEventListener('resize', fit);
    list.removeEventListener('scroll', onScroll);
    list.removeEventListener('load', onImage, true);
  };
  return dispose;
}
