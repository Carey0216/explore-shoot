import { $, api, esc, modal } from './ui.js';

let copyPromise,
  copyAt = 0,
  currentContext;
let visit = uuid(),
  shown = false,
  busy = false,
  lastOwner;
function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
function visitor() {
  try {
    let id = localStorage.getItem('campus-announcement-visitor');
    if (!/^[a-f0-9-]{36}$/.test(id || '')) {
      id = uuid();
      localStorage.setItem('campus-announcement-visitor', id);
    }
    return id;
  } catch {
    return fallbackVisitor;
  }
}
const fallbackVisitor = uuid();
export async function showRuntime() {
  try {
    const info = await api('/api/runtime');
    let label = $('#environment-badge');
    if (info.name === 'production') {
      label?.remove();
      return;
    }
    if (!label) {
      label = document.createElement('span');
      label.id = 'environment-badge';
      label.className = 'environment-badge';
      document.body.append(label);
    }
    label.textContent = info.label;
  } catch {
    /* A previous backend remains usable during a staged update. */
  }
}
export function publicCopy() {
  if (!copyPromise || Date.now() - copyAt > 30000) {
    copyAt = Date.now();
    copyPromise = api('/api/site-content').catch((error) => {
      copyPromise = null;
      throw error;
    });
  }
  return copyPromise;
}
export async function mountPublicContent(getContext) {
  currentContext = getContext;
  void showRuntime();
  try {
    const copy = await publicCopy(),
      { page } = getContext();
    const host = $('#main');
    if (!host) return;
    if (page === 'shots' || page === 'discover') {
      if (copy.notice && !$('#site-notice', host)) {
        const notice = document.createElement('div');
        notice.id = 'site-notice';
        notice.className = 'site-notice';
        notice.textContent = copy.notice;
        host.prepend(notice);
      }
    }
    if (['shots', 'me', 'settings'].includes(page) && !$('#site-help', host)) {
      const help = document.createElement('button');
      help.id = 'site-help';
      help.className = 'text-btn';
      help.textContent = '项目介绍与拍摄帮助';
      help.onclick = () =>
        modal(
          copy.siteName,
          `<p class="muted">${esc(copy.campusName)}</p>${[
            ['项目介绍', copy.about],
            ['使用帮助', copy.help],
            ['拍摄建议', copy.shootingGuide],
          ]
            .map(([title, text]) => `<h3>${title}</h3><p class="site-copy">${esc(text)}</p>`)
            .join(
              '',
            )}<h3>机位分类与拍摄条件</h3>${[...copy.categories, ...copy.conditions].map((r) => `<p><b>${esc(r.label)}</b> ${esc(r.description)}</p>`).join('')}`,
        );
      host.append(help);
    }
    for (const selector of ['.brand', '.mobile-brand']) {
      const brand = $(selector);
      const node = [...(brand?.childNodes || [])].find(
        (n) => n.nodeType === 3 && n.textContent.trim(),
      );
      if (node) node.textContent = copy.siteName;
    }
    document
      .querySelectorAll('[data-site-campus]')
      .forEach((n) => (n.textContent = copy.campusName));
    for (const item of copy.categories)
      document
        .querySelectorAll(`[data-theme="${item.id}"]`)
        .forEach((n) => (n.textContent = item.label));
    for (const item of copy.conditions)
      document
        .querySelectorAll(`[data-condition="${item.id}"], [data-shot-condition="${item.id}"]`)
        .forEach((n) => (n.textContent = item.label));
    void entryAnnouncement();
  } catch {
    /* Operational copy must never block the core page. */
  }
}
async function entryAnnouncement() {
  if (!currentContext || document.hidden || busy || $('dialog[open]')) return;
  const context = currentContext(),
    owner = context.account?.id || 'guest';
  if (owner !== lastOwner) {
    lastOwner = owner;
    visit = uuid();
    shown = false;
  }
  if (shown) return;
  const page = context.page === 'spot' ? 'spot' : context.page;
  if (
    ![
      'shots',
      'discover',
      'map',
      'navigate',
      'routes',
      'place',
      'spot',
      'me',
      'settings',
      'passport',
      'checkin',
      'notifications',
    ].includes(page)
  )
    return;
  busy = true;
  const entry = visit,
    visitorId = visitor();
  const stillCurrent = () =>
    entry === visit &&
    owner === (currentContext().account?.id || 'guest') &&
    page === currentContext().page &&
    !document.hidden &&
    !document.documentElement.classList.contains('viewport-blocked');
  try {
    const query = new URLSearchParams({ channel: 'web', page, visitorId, visitId: entry });
    const result = await api('/api/announcements?' + query);
    if (!result.announcement || !stillCurrent() || $('dialog[open]')) return;
    const claim = await api(
      '/api/announcements/' + result.announcement.id + '/impressions',
      'POST',
      {
        channel: 'web',
        page,
        visitorId,
        visitId: entry,
        requestId: uuid(),
        revision: result.announcement.revision,
      },
    );
    if (!claim.show || !stillCurrent() || $('dialog[open]')) return;
    shown = true;
    modal(
      claim.announcement.title,
      `<article class="site-copy">${esc(claim.announcement.body)}</article><button class="button wide" id="announcement-dismiss" style="margin-top:20px">知道了</button>`,
      (d) => {
        $('#announcement-dismiss', d).onclick = () => d.querySelector('.modal-close').click();
      },
    );
  } catch {
    /* Do not suppress navigation or login when announcement delivery fails. */
  } finally {
    busy = false;
  }
}
document.addEventListener('campus:modal-closed', () => queueMicrotask(entryAnnouncement));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    visit = uuid();
    shown = false;
    void entryAnnouncement();
  }
});
