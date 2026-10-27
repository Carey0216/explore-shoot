import { api, esc, icon, closeModal } from '/shared/ui.js';
import { featureOn, featureVisible } from '/shared/features.js';
import { createMessageQueue } from '/shared/message-alert-state.js';
let installed = false;
export function installMessageIslands(getState) {
  if (installed) return;
  installed = true;
  const queue = createMessageQueue();
  let owner = '',
    busy = false,
    epoch = 0,
    cursor = '',
    rotate,
    activeId = '';
  const host = document.createElement('aside');
  host.className = 'message-island812';
  host.setAttribute('aria-label', '管理员消息提醒');
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.hidden = true;
  document.body.append(host);
  const scope = () => String(getState().account?.id || '');
  const allowed = () => featureOn('messages') && featureVisible('messages');
  function dismiss() {
    clearTimeout(rotate);
    queue.dismiss();
    activeId = '';
    host.hidden = true;
    show();
  }
  function show() {
    if (
      document.hidden ||
      !owner ||
      !allowed() ||
      document.querySelector('dialog[open],.feature-tour') ||
      document.activeElement?.matches('input,textarea')
    ) {
      clearTimeout(rotate);
      host.hidden = true;
      return;
    }
    const n = queue.next();
    if (!n) {
      clearTimeout(rotate);
      activeId = '';
      host.hidden = true;
      return;
    }
    if (activeId === n.id && !host.hidden) return;
    document.querySelector('.collection-live813')?.remove();
    activeId = n.id;
    host.innerHTML =
      '<button type="button" class="message-island-main812" data-no-liquid>' +
      icon('message') +
      '<span><strong>管理员给你发来消息</strong><span class="message-island-copy812">' +
      esc(String(n.message || '图片或链接消息').slice(0, 120)) +
      '</span><small>点击回复' +
      (queue.count() > 1 ? ' · 还有 ' + (queue.count() - 1) + ' 条提醒' : '') +
      '</small></span></button><button class="message-island-close812" data-no-liquid type="button" aria-label="关闭这条提醒">' +
      icon('close') +
      '</button>';
    host.hidden = false;
    host.querySelector('.message-island-close812').onclick = dismiss;
    host.querySelector('.message-island-main812').onclick = () => {
      const target = n.target;
      dismiss();
      closeModal();
      document.querySelector('.support-close')?.click();
      if (location.hash === target) document.querySelector('#message-refresh')?.click();
      else location.hash = target;
    };
    clearTimeout(rotate);
    rotate = setTimeout(dismiss, 8000);
  }
  async function refresh() {
    const nextOwner = scope();
    if (owner !== nextOwner) {
      owner = nextOwner;
      epoch++;
      cursor = '';
      activeId = '';
      queue.reset(owner);
      clearTimeout(rotate);
      host.hidden = true;
    }
    if (!owner || document.hidden || !allowed() || busy) {
      show();
      return;
    }
    const at = epoch,
      expectedOwner = owner;
    busy = true;
    try {
      // Always fetch the newest page; deep unread history is scanned in bounded batches.
      let page = await api('/api/notifications?category=message');
      if (at !== epoch || scope() !== expectedOwner) return;
      queue.ingest(page.items);
      let next = cursor || page.next;
      for (let i = 0; next && i < 8; i++) {
        page = await api('/api/notifications?category=message&before=' + encodeURIComponent(next));
        if (at !== epoch || scope() !== expectedOwner) return;
        queue.ingest(page.items);
        next = page.next;
      }
      cursor = next || '';
      show();
    } catch (error) {
      if (error.status === 401 && scope() === expectedOwner) {
        owner = '';
        epoch++;
        queue.reset('');
        clearTimeout(rotate);
        host.hidden = true;
      }
    } finally {
      busy = false;
    }
  }
  setInterval(refresh, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(rotate);
      host.hidden = true;
    } else {
      activeId = '';
      void refresh();
    }
  });
  window.addEventListener('focus', () => void refresh());
  window.addEventListener('preferences:unauthorized', () => {
    owner = '';
    epoch++;
    queue.reset('');
    clearTimeout(rotate);
    host.hidden = true;
  });
  void refresh();
}
