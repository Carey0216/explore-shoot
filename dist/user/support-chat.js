import { $, api, esc, icon } from '/shared/ui.js';
import { featureVisible } from '/shared/features.js';
import { safeTarget } from '/shared/rich-message.js';
import {
  getPreferences,
  getPreferenceAccountId,
  subscribePreferences,
} from '/shared/preferences.js';
import { assistantAvatar } from '/shared/assistant-avatars.js';
const prefix = 'explore-support-chat-v1:';
const chatStorage = { getItem: (key) => localStorage.getItem(key) };
export function readChat(storage, key) {
  try {
    const saved = JSON.parse(storage.getItem(prefix + key) || '{}');
    const turns = (Array.isArray(saved.turns) ? saved.turns : [])
      .filter((t) => ['user', 'assistant'].includes(t?.role) && typeof t.content === 'string')
      .slice(-40)
      .map((t) => ({
        role: t.role,
        content: t.content.slice(0, 4000),
        links: Array.isArray(t.links) ? t.links.slice(0, 6) : [],
      }));
    let input = String(saved.input || '').slice(0, 300);
    if (
      saved.pendingQuestion &&
      turns.at(-1)?.role === 'user' &&
      turns.at(-1).content === saved.pendingQuestion
    ) {
      input = saved.pendingQuestion;
      turns.pop();
    }
    return { turns, input };
  } catch {
    return { turns: [], input: '' };
  }
}
let installed = false;
export function installSupport() {
  if (installed || !featureVisible('support')) return;
  installed = true;
  const launcher = document.createElement('button'),
    panel = document.createElement('aside');
  launcher.type = 'button';
  launcher.dataset.noLiquid = '';
  launcher.className = 'support-orb';
  launcher.setAttribute('aria-label', '打开校园助手');
  launcher.setAttribute('aria-controls', 'support-popover');
  launcher.setAttribute('aria-expanded', 'false');
  panel.id = 'support-popover';
  panel.className = 'support-popover';
  panel.setAttribute('popover', 'auto');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '校园助手');
  panel.innerHTML = `<header class="support-header"><span class="support-avatar-slot"></span><strong>校园助手</strong><span class="support-dot offline" role="img" aria-label="未接入生成模型" title="未接入生成模型"></span><button class="support-clear icon-btn" aria-label="清空本机对话" title="清空本机对话">${icon('trash')}</button><button class="support-close icon-btn" aria-label="收起助手">${icon('close')}</button></header><div class="support-transcript" role="log" aria-live="polite"></div><form id="support-form"><textarea id="support-question" name="question" aria-label="输入消息" maxlength="300" rows="1" required placeholder="输入消息…"></textarea><button class="support-send" type="submit" aria-label="发送">${icon('send')}</button></form><p class="support-error" role="status"></p>`;
  const native = typeof panel.showPopover === 'function';
  if (!native) {
    panel.removeAttribute('popover');
    panel.hidden = true;
  }
  document.body.append(launcher, panel);
  const anchor = () => {
    const frame = document.querySelector('.app-shell')?.getBoundingClientRect();
    if (!frame) return;
    const right = Math.max(0, document.documentElement.clientWidth - frame.right);
    for (const el of [launcher, panel]) {
      el.style.setProperty('--support-edge', right + 'px');
      el.style.setProperty(
        '--support-width',
        Math.max(200, Math.min(370, frame.width - 24)) + 'px',
      );
    }
  };
  window.addEventListener('resize', anchor);
  new ResizeObserver(anchor).observe(document.querySelector('.app-shell'));
  anchor();
  const input = $('#support-question', panel),
    transcript = $('.support-transcript', panel),
    form = $('#support-form', panel),
    error = $('.support-error', panel),
    dot = $('.support-dot', panel);
  let key = getPreferenceAccountId() || 'guest',
    chat = readChat(chatStorage, key),
    busy = false,
    scopeRevision = 0,
    pendingQuestion = '',
    timer;
  const save = () => {
    try {
      localStorage.setItem(
        prefix + key,
        JSON.stringify({
          turns: chat.turns,
          input: input.value,
          pendingQuestion,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      error.textContent = '浏览器未能保存，关闭或刷新前请复制未发送的内容。';
    }
  };
  const draw = () => {
    transcript.innerHTML = chat.turns.length
      ? chat.turns
          .map(
            (t) =>
              `<article class="chat-turn ${t.role}"><p>${esc(t.content)}</p>${t.links.map((l) => (safeTarget(l?.path) ? `<a href="${esc(safeTarget(l.path))}" class="text-btn">${esc(l.title)} ↗</a>` : '')).join('')}</article>`,
          )
          .join('')
      : '<div class="support-empty"><span>' +
        assistantAvatar(getPreferences().assistantAvatar) +
        '</span><p>想去哪儿拍？</p></div>';
    $('.support-send', panel).disabled = busy;
    input.disabled = busy;
    transcript.scrollTop = transcript.scrollHeight;
  };
  input.value = chat.input;
  const avatar = () => {
    launcher.innerHTML = assistantAvatar(getPreferences().assistantAvatar);
    $('.support-avatar-slot', panel).innerHTML = assistantAvatar(getPreferences().assistantAvatar);
  };
  const isOpen = () => (native ? panel.matches(':popover-open') : !panel.hidden);
  const rest = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!isOpen()) launcher.classList.add('resting');
    }, 10000);
  };
  const wake = () => {
    launcher.classList.remove('resting');
    rest();
  };
  const hide = () => {
    save();
    if (native && isOpen()) panel.hidePopover();
    else if (!native) panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    rest();
  };
  const status = (available) => {
    dot.classList.toggle('offline', !available);
    dot.setAttribute('aria-label', available ? '已接入生成模型' : '未接入生成模型');
    dot.title = available ? '已接入生成模型' : '未接入生成模型';
  };
  const open = async () => {
    if (isOpen()) {
      hide();
      return;
    }
    wake();
    draw();
    if (native) panel.showPopover();
    else panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    try {
      const caps = await api('/api/assistant/capabilities');
      status(caps.generationAvailable);
    } catch {
      status(false);
    }
  };
  launcher.onclick = () => void open();
  launcher.onpointerenter = wake;
  launcher.onfocus = wake;
  $('.support-close', panel).onclick = hide;
  panel.addEventListener('toggle', () => {
    launcher.setAttribute('aria-expanded', String(isOpen()));
    if (!isOpen()) {
      save();
      rest();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!native && isOpen() && !panel.contains(event.target) && !launcher.contains(event.target))
      hide();
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide();
      launcher.focus();
    }
  });
  input.oninput = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(90, input.scrollHeight) + 'px';
    save();
  };
  $('.support-clear', panel).onclick = () => {
    if (busy) return;
    chat = { turns: [], input: '' };
    input.value = '';
    pendingQuestion = '';
    error.textContent = '';
    save();
    draw();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const question = input.value.trim();
    if (!question) return;
    const scope = key,
      stamp = scopeRevision,
      history = chat.turns
        .slice(-8)
        .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
    chat.turns.push({ role: 'user', content: question, links: [] });
    pendingQuestion = question;
    input.value = '';
    input.style.height = '';
    busy = true;
    error.textContent = '';
    save();
    draw();
    try {
      const answer = await api('/api/assistant/chat', 'POST', {
        question,
        history,
        purpose: 'support',
        generate: true,
      });
      if (scope !== key || stamp !== scopeRevision) return;
      status(answer.mode === 'generated');
      chat.turns.push({
        role: 'assistant',
        content: answer.answer.slice(0, 4000),
        links: answer.citations || [],
      });
      chat.turns = chat.turns.slice(-40);
      pendingQuestion = '';
    } catch (failure) {
      if (scope === key && stamp === scopeRevision) {
        chat.turns.pop();
        input.value = question;
        pendingQuestion = '';
        error.textContent = failure.message;
        status(false);
      }
    } finally {
      if (scope === key && stamp === scopeRevision) {
        busy = false;
        save();
        draw();
      }
    }
  };
  subscribePreferences(() => {
    const next = getPreferenceAccountId() || 'guest';
    if (next !== key) {
      hide();
      scopeRevision++;
      key = next;
      chat = readChat(chatStorage, key);
      input.value = chat.input;
      pendingQuestion = '';
      busy = false;
      draw();
    }
    avatar();
  });
  window.addEventListener('support:open', () => {
    if (!isOpen()) void open();
  });
  window.addEventListener('pagehide', save);
  avatar();
  draw();
  rest();
}
