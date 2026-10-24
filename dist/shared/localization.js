import dictionary from './locales/en-US.js';
import {
  getPreferences,
  getPreferenceAccountId,
  subscribePreferences,
  updatePreferences,
  preferenceScope,
} from './preferences.js';
import { controlPopover } from './popover-controller.js';

export const languageFromDevice = (language) =>
  /^en(?:[-_]|$)/i.test(language || '') ? 'en-US' : 'zh-CN';
export const forcedLanguage = (pathname) =>
  String(pathname || '').match(/^\/(?:admin\/)?(zh-CN|en-US)(?:\/|$)/)?.[1] || '';
export function effectiveLanguage(preference = getPreferences().language) {
  return (
    forcedLanguage(location.pathname) ||
    (preference === 'system'
      ? languageFromDevice(navigator.languages?.[0] || navigator.language)
      : preference === 'en-US'
        ? 'en-US'
        : 'zh-CN')
  );
}
const patterns = Object.entries(dictionary)
  .filter(([s]) => /\{\w+\}/.test(s) && s.replace(/\{\w+\}/g, '').trim().length > 1)
  .map(([source, target]) => {
    const keys = [];
    const expression = source
      .split(/(\{\w+\})/)
      .map((part) => {
        if (/^\{\w+\}$/.test(part)) {
          keys.push(part.slice(1, -1));
          return '(.+?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { regex: new RegExp('^' + expression + '$'), target, keys };
  })
  .sort((a, b) => b.regex.source.length - a.regex.source.length);
export function uiText(value, language = effectiveLanguage()) {
  const raw = String(value ?? ''),
    source = raw.trim();
  if (language !== 'en-US') return raw;
  if (Object.hasOwn(dictionary, source)) return raw.replace(source, dictionary[source]);
  for (const p of patterns) {
    const match = source.match(p.regex);
    if (match)
      return raw.replace(
        source,
        p.target.replace(/\{(\w+)\}/g, (_, key) =>
          uiText(match[p.keys.indexOf(key) + 1], language),
        ),
      );
  }
  return raw;
}
let language = 'zh-CN',
  epoch = 0,
  scope = '',
  installed = false,
  original = false,
  coolUntil = 0;
const translated = new Map(),
  controllers = new Set(),
  listeners = new Set();
export const currentLanguage = () => language;
export const subscribeLanguage = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const needsTranslation = (text, target) =>
  target === 'en-US'
    ? /[\u3400-\u9fff]/.test(text)
    : !/[\u3400-\u9fff]/.test(text) && /[A-Za-z]+\s+[A-Za-z]+/.test(text);
export async function translateContent(texts, target = effectiveLanguage()) {
  const stamp = epoch,
    result = texts.map(String),
    missing = [];
  for (const text of new Set(result)) {
    const known = uiText(text, target);
    if (known !== text || !needsTranslation(text, target))
      translated.set(target + '\0' + text, known);
    else if (!translated.has(target + '\0' + text) && text.length <= 4000) missing.push(text);
  }
  if (missing.length && Date.now() >= coolUntil) {
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 68000);
    try {
      for (let at = 0; at < missing.length;) {
        const batch = [];
        let length = 0;
        while (at < missing.length && batch.length < 40 && length + missing[at].length <= 8000) {
          length += missing[at].length;
          batch.push(missing[at++]);
        }
        if (!batch.length) {
          at++;
          continue;
        }
        const response = await fetch('/api/localization/translate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: batch, target }),
          signal: controller.signal,
        });
        if (!response.ok) throw Error('translation unavailable');
        const data = await response.json();
        if (stamp !== epoch || data.texts?.length !== batch.length) return result;
        batch.forEach((text, i) => {
          if (typeof data.texts[i] === 'string')
            translated.set(target + '\0' + text, data.texts[i]);
        });
        while (translated.size > 500) translated.delete(translated.keys().next().value);
      }
    } catch {
      if (stamp === epoch) coolUntil = Date.now() + 20000;
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  }
  return stamp === epoch
    ? result.map((text) => translated.get(target + '\0' + text) || text)
    : result;
}
const roots =
  '#main,.compact-popover,.admin-content,#auth-root,#dialog,#startup,#admin-startup,.support-popover,#mobile-nav,.admin-dock,#topbar,#toast';
const excluded =
  'script,style,svg,canvas,textarea,input,.identity73 h2,[data-i18n-skip],.campus-brand,.assistant-avatar,.avatar,.account-avatar,.chat-reveal,.locale-menu,.locale-control,.content-language-bar,.tencent-map-surface,.provider-map-surface';
const content =
  '.site-copy,#dialog [data-help-copy],.chat-turn,.release-note,.whatsnew-summary,.notice-copy,.message-copy,.place-description,.place-detail-sheet h1,.story-title73,.story-line73,.map-item strong,[data-user-content]';
const texts = new WeakMap(),
  attributes = new WeakMap(),
  pending = new Map(),
  menus = new Map();
let observer,
  scheduled = false,
  timer,
  processing = false;
function queue(source, node) {
  if (source.length > 4000 || !source.trim() || !needsTranslation(source, language)) return;
  if (!pending.has(source)) pending.set(source, new Set());
  pending.get(source).add(node);
  if (!timer) timer = setTimeout(flush, 180);
}
async function flush() {
  timer = null;
  if (processing) return;
  const stamp = epoch,
    target = language;
  const selected = [...pending]
    .filter(([, nodes]) => [...nodes].some((n) => n.isConnected))
    .map(([s]) => s);
  pending.clear();
  if (!selected.length) return;
  processing = true;
  try {
    await translateContent(selected, target);
  } finally {
    processing = false;
  }
  if (stamp === epoch) batch();
  if (pending.size && !timer && Date.now() >= coolUntil) timer = setTimeout(flush, 250);
}
function output(source, parent, node) {
  const known = uiText(source, language),
    isContent = !!parent.closest(content);
  if (original && (isContent || (known === source && needsTranslation(source, language))))
    return source;
  if (known !== source) return known;
  const cached = translated.get(language + '\0' + source);
  if (cached) return cached;
  if (Date.now() >= coolUntil) queue(source, node);
  return source;
}
function visit(node) {
  if (node.nodeType === 3) {
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded)) return;
    let entry = texts.get(node);
    if (!entry || node.data !== entry.output) entry = { source: node.data };
    entry.output = output(entry.source, parent, node);
    texts.set(node, entry);
    if (node.data !== entry.output) node.data = entry.output;
    return;
  }
  if (node.nodeType !== 1 || (node.closest(excluded) && !node.matches('input,textarea'))) return;
  if (node.tagName === 'OPTION' && !node.hasAttribute('value'))
    node.setAttribute('value', node.textContent.trim());
  let cached = attributes.get(node);
  if (!cached) {
    cached = new Map();
    attributes.set(node, cached);
  }
  for (const name of ['placeholder', 'aria-label', 'title', 'alt']) {
    const value = node.getAttribute(name);
    if (value === null) continue;
    let entry = cached.get(name);
    if (!entry || value !== entry.output) entry = { source: value };
    entry.output = output(entry.source, node, node);
    cached.set(name, entry);
    if (value !== entry.output) node.setAttribute(name, entry.output);
  }
  if (node.matches('input,textarea')) return;
  for (const child of [...node.childNodes]) visit(child);
}
function stripLanguage(pathname) {
  return (
    pathname.replace(/^\/(admin\/)?(?:zh-CN|en-US)(?=\/|$)/, (_, admin) =>
      admin ? '/admin' : '',
    ) || '/'
  );
}
export async function selectLanguage(value) {
  await updatePreferences({ language: value });
  if (forcedLanguage(location.pathname))
    history.replaceState(
      history.state,
      '',
      stripLanguage(location.pathname) + location.search + location.hash,
    );
  applyLanguage();
}
function installMenus() {
  for (const [host, item] of menus)
    if (!host.isConnected) {
      item.controller.destroy();
      item.panel.remove();
      menus.delete(host);
    }
  for (const host of document.querySelectorAll(
    '#topbar .header-right,.admin-header > .button-row,#auth-root .auth-topline',
  )) {
    if (menus.has(host)) continue;
    const button = document.createElement('button'),
      panel = document.createElement('section');
    button.type = 'button';
    button.className = 'locale-control icon-btn';
    button.dataset.noLiquid = '';
    button.setAttribute('aria-label', 'Language / 语言');
    button.setAttribute('aria-expanded', 'false');
    panel.className = 'locale-menu';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Language / 语言');
    host.prepend(button);
    document.body.append(panel);
    const controller = controlPopover(button, panel, {
      position: () => {
        const r = button.getBoundingClientRect();
        panel.style.left = Math.max(8, Math.min(innerWidth - 252, r.right - 244)) + 'px';
        panel.style.top =
          Math.max(
            8,
            Math.min((window.visualViewport?.height || innerHeight) - 250, r.bottom + 8),
          ) + 'px';
      },
    });
    const item = { button, panel, controller };
    menus.set(host, item);
    panel.addEventListener('click', async (event) => {
      const choice = event.target.closest('[data-language]');
      if (!choice) return;
      panel.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try {
        await selectLanguage(choice.dataset.language);
        controller.close();
      } catch {
        panel.querySelector('.locale-error').textContent = uiText('设置未保存，请重试', language);
      } finally {
        panel.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    });
  }
  for (const item of menus.values()) {
    const { button, panel } = item;
    const signature = [
      language,
      getPreferences().language,
      preferenceScope(),
      forcedLanguage(location.pathname),
    ].join(':');
    if (item.signature === signature) continue;
    item.signature = signature;
    const flag = language === 'en-US' ? 'us' : 'cn';
    button.innerHTML = `<span class="flag-disc"><img src="/shared/flags/${flag}.svg" alt="${language === 'en-US' ? 'English' : '简体中文'}"></span>`;
    panel.innerHTML = `<h2>Language / 语言</h2>${[
      ['zh-CN', '简体中文', 'cn'],
      ['en-US', 'English', 'us'],
    ]
      .map(
        ([value, label, code]) =>
          `<button type="button" data-language="${value}" aria-pressed="${getPreferences().language === value}"><span class="flag-disc"><img src="/shared/flags/${code}.svg" alt=""></span><span>${label}</span><b>${getPreferences().language === value ? '✓' : ''}</b></button>`,
      )
      .join(
        '',
      )}<button type="button" data-language="system" aria-pressed="${getPreferences().language === 'system'}">${uiText('跟随设备语言', language)} ${getPreferences().language === 'system' ? '✓' : ''}</button><small>${preferenceScope() === 'account' ? uiText('语言偏好会随账号保存', language) : language === 'en-US' ? 'Saved on this device. Sign in to sync.' : '保存在此设备，登录后可同步账号。'}${forcedLanguage(location.pathname) ? '<br>' + uiText('当前链接临时指定语言，不改变账号偏好。', language) : ''}</small><p class="locale-error" role="status"></p>`;
  }
}
function originalControl() {
  const root = document.querySelector('#main,#admin-body');
  if (!root) return;
  let bar = root.querySelector(':scope > .content-language-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'content-language-bar';
    bar.innerHTML = '<span></span><button type="button" data-locale-original></button>';
    root.prepend(bar);
    bar.querySelector('button').onclick = () => {
      original = !original;
      batch();
    };
  }
  const has =
    original ||
    Date.now() < coolUntil ||
    [...translated].some(
      ([key, value]) =>
        key.startsWith(language + '\0') && value !== key.slice(key.indexOf('\0') + 1),
    );
  bar.hidden = !has;
  bar.querySelector('span').textContent = uiText(
    Date.now() < coolUntil
      ? '内容翻译暂时不可用，当前显示原文。'
      : '内容由机器翻译，原文始终保留。',
    language,
  );
  bar.querySelector('button').textContent = uiText(original ? '显示译文' : '查看原文', language);
  bar.querySelector('button').setAttribute('aria-pressed', String(original));
}
function batch() {
  if (!installed) return;
  observer?.disconnect();
  for (const root of document.querySelectorAll(roots))
    if (!root.parentElement?.closest(roots)) visit(root);
  installMenus();
  originalControl();
  observer?.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title', 'alt'],
  });
}
function applyLanguage() {
  const next = effectiveLanguage(),
    nextScope =
      (document.body.dataset.audience || 'user') + ':' + (getPreferenceAccountId() || 'guest');
  if (scope !== nextScope || language !== next) {
    epoch++;
    controllers.forEach((c) => c.abort());
    controllers.clear();
    translated.clear();
    pending.clear();
    original = false;
    coolUntil = 0;
    scope = nextScope;
    language = next;
  }
  document.documentElement.lang = language;
  document.title =
    language === 'en-US' ? 'JINGYU · Explore. Capture. Connect.' : '景遇 · 在校园，遇见更多美好';
  batch();
  listeners.forEach((fn) => fn(language));
}
export function startLocalization() {
  if (installed) return;
  installed = true;
  observer = new MutationObserver((records) => {
    if (
      scheduled ||
      !records.some(
        (r) =>
          (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest(roots) ||
          [...r.addedNodes].some(
            (n) => n.nodeType === 1 && (n.matches(roots) || n.querySelector(roots)),
          ),
      )
    )
      return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      batch();
    });
  });
  subscribePreferences(applyLanguage);
  window.addEventListener('languagechange', applyLanguage);
  window.addEventListener('popstate', applyLanguage);
  applyLanguage();
}
