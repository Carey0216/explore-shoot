import { assistantLinkLabel } from '/shared/assistant-guidance.js';
import { followAssistantLink } from './support-navigation.js';
import { translateContent } from '/shared/localization.js';
import { replyDelay, pauseReply, revealReply } from '/shared/chat-feedback.js';
import { controlPopover } from '/shared/popover-controller.js';
import { $, api, esc, icon } from '/shared/ui.js';
import { loadCampusWeather, weatherCardHTML } from './photo-timing.js';
import { featureOn, featureVisible } from '/shared/features.js';
import { safeTarget } from '/shared/rich-message.js';
import {
  getPreferences,
  getPreferenceAccountId,
  subscribePreferences,
} from '/shared/preferences.js';
import { assistantAvatar } from '/shared/assistant-avatars.js';
const prefix = 'explore-support-chat-v1:';
const chatStorage = { getItem: (key) => localStorage.getItem(key) };
export function supportAnswerLinks(answer) {
  return [
    ...(answer.places || []).map((p) => ({
      title: p.name,
      path: '#place/' + encodeURIComponent(p.id),
    })),
    ...(answer.sources || []),
  ]
    .filter((link) => safeTarget(link?.path))
    .slice(0, 6);
}
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
        mode: ['preset', 'retrieved', 'generated'].includes(t.mode) ? t.mode : '',
      }));
    let input = String(saved.input || '').slice(0, 300);
    if (
      saved.pendingQuestion &&
      turns.at(-1)?.role === 'user' &&
      turns.at(-1).content === saved.pendingQuestion
    ) {
      input = input || saved.pendingQuestion;
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
  launcher.dataset.feature = 'support';
  launcher.className = 'support-orb';
  launcher.setAttribute('aria-label', '打开校园助手');
  launcher.setAttribute('aria-controls', 'support-popover');
  launcher.setAttribute('aria-expanded', 'false');
  panel.id = 'support-popover';
  panel.className = 'support-popover';
  panel.setAttribute('popover', 'auto');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '校园助手');
  panel.innerHTML = `<header class="support-header"><span class="support-avatar-slot"></span><strong>校园助手</strong><span class="support-dot offline" role="img" aria-label="未接入生成模型" title="未接入生成模型"></span><button class="support-clear icon-btn" aria-label="清空本机对话" title="清空本机对话">${icon('trash')}</button><button class="support-close icon-btn" aria-label="收起助手">${icon('close')}</button></header><div class="support-weather81" hidden></div><button class="support-weather-retry811" hidden type="button">天气暂不可用 · 重试</button><div class="support-transcript" role="log" aria-live="polite"></div><button type="button" class="support-further" hidden></button><button type="button" class="support-plan-entry" data-feature="exploration" ${featureVisible('exploration') ? '' : 'hidden'}>安排一次拍摄 <span>↗</span></button><form id="support-form"><textarea id="support-question" name="question" enterkeyhint="send" aria-label="输入消息" maxlength="300" rows="1" required placeholder="输入消息…"></textarea><button class="support-send" data-no-liquid type="submit" aria-label="发送">${icon('send')}</button></form><p class="support-error" role="status"></p>`;
  document.body.append(launcher, panel);
  const anchor = () => {
    const vv = window.visualViewport;
    panel.style.setProperty('--support-vh', (vv?.height || window.innerHeight) + 'px');
    panel.style.setProperty('--support-top', (vv?.offsetTop || 0) + 'px');
    panel.classList.toggle(
      'support-compact',
      (vv?.height || window.innerHeight) < 550 ||
        window.innerHeight - (vv?.height || window.innerHeight) > 120,
    );
    const frame = document.querySelector('.app-shell')?.getBoundingClientRect();
    if (!frame) return;
    const right = Math.max(0, document.documentElement.clientWidth - frame.right);
    const width = Math.max(200, Math.min(370, frame.width - 24));
    // A narrow screen has no safe left gutter: dock the pill above the left corner.
    panel.classList.toggle('weather-above81', frame.right - 12 - width < 144);
    for (const el of [launcher, panel]) {
      el.style.setProperty('--support-edge', right + 'px');
      el.style.setProperty('--support-width', width + 'px');
    }
  };
  window.addEventListener('resize', anchor);
  window.visualViewport?.addEventListener('resize', anchor);
  window.visualViewport?.addEventListener('scroll', anchor);
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
    revealing = false,
    pendingQuestion = '',
    timer;
  let capabilities = {
    generationAvailable: false,
    furtherEnabled: false,
    modelLabel: 'AI',
    presets: [],
  };
  const furtherButton = $('.support-further', panel);
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
    if (revealing) return;
    transcript.innerHTML = chat.turns.length
      ? chat.turns
          .map(
            (t) =>
              `<article class="chat-turn ${t.role}"><p>${esc(t.content)}</p>${(t.revealing ? [] : t.links).map((l) => (safeTarget(l?.path) ? `<a href="${esc(safeTarget(l.path))}" class="support-place-link">${icon('pin')}<span>${esc(assistantLinkLabel(l))}</span> ↗</a>` : '')).join('')}</article>`,
          )
          .join('')
      : '<div class="support-empty"><span>' +
        assistantAvatar(getPreferences().assistantAvatar) +
        '</span><h3>想拍点什么？</h3><p>找地点、看拍法，或者一起安排一条短路线。</p><div class="support-presets">' +
        capabilities.presets
          .slice(0, 4)
          .map(
            (p, i) => `<button type="button" data-support-preset="${i}">${esc(p.title)}</button>`,
          )
          .join('') +
        '</div></div>';
    furtherButton.hidden =
      busy ||
      !capabilities.generationAvailable ||
      !capabilities.furtherEnabled ||
      !['preset', 'retrieved'].includes(chat.turns.at(-1)?.mode);
    furtherButton.textContent = `使用${capabilities.modelLabel}进一步回答`;
    $('.support-send', panel).disabled = busy;
    input.disabled = false;
    transcript.setAttribute('aria-busy', String(busy));
    if (busy && pendingQuestion)
      transcript.insertAdjacentHTML(
        'beforeend',
        '<article class="chat-turn assistant" role="status" aria-label="校园助手正在回复"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></article>',
      );
    transcript.scrollTop = transcript.scrollHeight;
  };
  input.value = chat.input;
  const avatar = () => {
    launcher.innerHTML = assistantAvatar(getPreferences().assistantAvatar);
    $('.support-avatar-slot', panel).innerHTML = assistantAvatar(getPreferences().assistantAvatar);
  };
  const isOpen = () => controller.isOpen();
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
    controller.close();
    rest();
  };
  const status = (available) => {
    dot.classList.toggle('offline', !available);
    dot.setAttribute('aria-label', available ? '已接入生成模型' : '未接入生成模型');
    dot.title = available ? '已接入生成模型' : '未接入生成模型';
  };
  let weatherRevision = 0;
  const refreshWeather = async (force = false) => {
    const target = $('.support-weather81', panel),
      stamp = ++weatherRevision;
    target.hidden = true;
    $('.support-weather-retry811', panel).hidden = true;
    panel.classList.remove('has-weather81');
    if (!isOpen() || !featureVisible('weather')) return;
    if (!featureOn('weather')) {
      target.innerHTML =
        '<button type="button" class="text-btn" data-feature="weather">查看天气</button>';
      target.hidden = false;
      panel.classList.add('has-weather81');
      return;
    }
    try {
      const data = await loadCampusWeather(force);
      if (
        stamp !== weatherRevision ||
        !isOpen() ||
        !featureOn('weather') ||
        !featureVisible('weather')
      )
        return;
      if (!data.available) {
        $('.support-weather-retry811', panel).hidden = false;
        return;
      }
      target.innerHTML = weatherCardHTML(data);
      target.hidden = false;
      panel.classList.add('has-weather81');
    } catch {
      if (isOpen() && stamp === weatherRevision && featureOn('weather'))
        $('.support-weather-retry811', panel).hidden = false;
    }
  };
  $('.support-weather-retry811', panel).onclick = () => void refreshWeather(true);
  window.addEventListener('features:change', () => {
    if (isOpen()) void refreshWeather();
  });
  const controller = controlPopover(launcher, panel, {
    position: anchor,
    onChange(opened) {
      if (opened) {
        void refreshWeather();
        wake();
        draw();
        void api('/api/assistant/capabilities')
          .then((caps) => {
            capabilities = { ...capabilities, ...caps };
            status(caps.generationAvailable);
            draw();
          })
          .catch(() => status(false));
      } else {
        save();
        rest();
      }
    },
  });
  const open = () => controller.open();
  launcher.onpointerenter = wake;
  launcher.onfocus = wake;
  $('.support-close', panel).onclick = hide;
  $('.support-plan-entry', panel).onclick = () => {
    hide();
    void import('./plan-preview.js')
      .then((m) =>
        m.openPlanPreview(
          {
            question: chat.turns.filter((t) => t.role === 'user').at(-1)?.content || '',
            anchor: launcher,
          },
          getPreferenceAccountId() ? { id: getPreferenceAccountId() } : null,
        ),
      )
      .catch((e) => {
        error.textContent = e.message;
      });
  };
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
  const ask = async (question, further = false) => {
    if (busy || !question) return;
    const started = Date.now();
    const draftBefore = input.value;
    const scope = key,
      stamp = scopeRevision,
      history = chat.turns
        .slice(-8)
        .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
    chat.turns.push({ role: 'user', content: question, links: [] });
    pendingQuestion = question;
    if (!further) input.value = '';
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
        further,
      });
      const [displayAnswer] = await translateContent([answer.answer.slice(0, 4000)]);
      await pauseReply(replyDelay(started));
      if (scope !== key || stamp !== scopeRevision) return;
      status(capabilities.generationAvailable);
      chat.turns.push({
        role: 'assistant',
        mode: answer.mode,
        content: answer.answer.slice(0, 4000),
        links: supportAnswerLinks(answer),
        revealing: true,
      });
      chat.turns = chat.turns.slice(-40);
      pendingQuestion = '';
      save();
      draw();
      revealing = true;
      await revealReply(
        transcript.querySelector('.chat-turn.assistant:last-child p'),
        displayAnswer,
        matchMedia('(prefers-reduced-motion: reduce)').matches,
        () => scope === key && stamp === scopeRevision,
      );
    } catch (failure) {
      if (scope === key && stamp === scopeRevision) {
        chat.turns.pop();
        if (!input.value.trim()) input.value = further ? draftBefore : question;
        pendingQuestion = '';
        error.textContent = failure.message;
        status(false);
      }
    } finally {
      if (scope === key && stamp === scopeRevision) {
        revealing = false;
        chat.turns.forEach((turn) => delete turn.revealing);
        busy = false;
        save();
        draw();
      }
    }
  };
  $('.support-send', panel).addEventListener('pointerdown', (event) => {
    if (event.isPrimary !== false) event.preventDefault();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      void ask(input.value.trim());
    }
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    void ask(input.value.trim());
  };
  transcript.addEventListener('click', (event) => {
    const link = event.target.closest('.support-place-link');
    if (link) {
      const target = safeTarget(link.getAttribute('href'));
      if (target?.startsWith('#')) {
        event.preventDefault();
        followAssistantLink({ path: target, title: link.textContent }, hide);
      } else hide();
      return;
    }
    const b = event.target.closest('[data-support-preset]');
    if (b) void ask(capabilities.presets[Number(b.dataset.supportPreset)]?.question || '');
  });
  furtherButton.onclick = () => {
    const question = chat.turns.filter((t) => t.role === 'user').at(-1)?.content;
    if (question) void ask(question, true);
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
      revealing = false;
      draw();
    }
    avatar();
  });
  window.addEventListener('support:open', () => {
    if (!isOpen()) void open();
  });
  window.addEventListener('hashchange', () => {
    if (isOpen()) hide();
  });
  window.addEventListener('pagehide', save);
  avatar();
  draw();
  rest();
}
