// Display-only translation. Canonical records, form values and account names are never rewritten.
const dictionary = require('./locale-catalogue');
const appearance = require('./appearance');
const views = new Set();
const visibleFields = new Set(require('./locale-display-fields'));
let navigationTitle = '',
  navigationMethod;
const pageTitles = require('./locale-page-titles');
let language = 'zh-CN',
  scope = '',
  epoch = 0,
  original = false,
  installed = false;
let cache = Object.create(null),
  pending = new Set(),
  timer,
  working = false,
  cooldown = 0;
let editorialOrigin = '',
  editorialAt = 0,
  editorial = {},
  editorialPending;
async function refreshEditorial() {
  if (language !== 'en-US') return;
  const origin = require('./network').configuredOrigin(),
    stamp = epoch;
  if (editorialOrigin !== origin) {
    editorialOrigin = origin;
    editorialAt = 0;
    editorial = {};
    editorialPending = null;
  }
  if (Date.now() - editorialAt < 15000) return;
  if (!editorialPending) {
    const current = origin;
    editorialPending = Promise.resolve()
      .then(() => require('./api').request('/api/localization/editorial'))
      .then((data) => {
        if (current === editorialOrigin) {
          editorial = data.entries || {};
          editorialAt = Date.now();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (current === editorialOrigin) editorialPending = null;
      });
  }
  await editorialPending;
  if (stamp === epoch && language === 'en-US') {
    Object.assign(cache, editorial);
    publish();
  }
}
function deviceLanguage(value) {
  return /^en(?:[-_]|$)/i.test(value || '') ? 'en-US' : 'zh-CN';
}
function resolved(preference) {
  return preference === 'en-US' || preference === 'zh-CN'
    ? preference
    : deviceLanguage((wx.getAppBaseInfo?.() || wx.getSystemInfoSync?.() || {}).language);
}
function ui(value) {
  if (typeof value !== 'string' || language !== 'en-US') return value;
  const key = value.trim();
  return Object.prototype.hasOwnProperty.call(dictionary, key)
    ? value.replace(key, dictionary[key])
    : value;
}
function state(view) {
  const entries = Object.entries(cache).filter(([key]) => view?.__localeSources?.has(key));
  return {
    locale: language,
    localeTranslations: Object.fromEntries(entries),
    localeOriginal: original,
    localeTranslationUnavailable: Date.now() < cooldown,
    localeTranslated: Date.now() < cooldown || entries.some(([key, value]) => key !== value),
  };
}
function publishView(view) {
  if (view.__localeDisposed || view.__localeActive === false) return;
  const data = state(view),
    signature = JSON.stringify(data);
  if (signature === view.__localeSignature) return;
  view.__localeSignature = signature;
  view.__localeSetData(data);
}
function publish() {
  for (const view of views) publishView(view);
}
function install() {
  if (installed) return;
  installed = true;
  appearance.subscribe((data) => {
    const administrator = /:admin:/.test(data.preferenceScope || scope);
    const client = require(administrator ? './admin-api' : './api');
    const nextScope =
      data.preferenceScope ||
      require('./network').configuredOrigin() +
        ':' +
        (administrator ? 'admin:' : 'user:') +
        (client.session()?.account?.id || 'guest');
    const next = resolved(data.preferences.language);
    const languageChanged = next !== language;
    const changedScope = nextScope !== scope;
    if (next !== language || changedScope) {
      language = next;
      scope = nextScope;
      epoch++;
      cache = Object.create(null);
      pending.clear();
      original = false;
      cooldown = 0;
    }
    if (languageChanged && navigationTitle && navigationMethod)
      navigationMethod.call(wx, { title: ui(navigationTitle) });
    if (changedScope)
      for (const view of views) {
        view.__localeSources?.clear();
        view.__localeSignature = '';
      }
    publish();
    if (!changedScope)
      for (const view of views)
        if (view.__localeActive !== false) collect(view.data, false, 0, view);
  });
  for (const name of ['showToast', 'showModal', 'showActionSheet', 'setNavigationBarTitle']) {
    const method = wx[name];
    if (typeof method !== 'function') continue;
    if (name === 'setNavigationBarTitle') navigationMethod = method;
    wx[name] = function (options = {}) {
      const next = { ...options };
      if (name === 'setNavigationBarTitle') navigationTitle = options.title || '';
      for (const key of ['title', 'content', 'confirmText', 'cancelText'])
        if (typeof next[key] === 'string') next[key] = ui(next[key]);
      if (next.itemList) next.itemList = next.itemList.map(ui);
      return method.call(wx, next);
    };
  }
}
function needs(text) {
  return (
    typeof text === 'string' &&
    text.length <= 4000 &&
    text.trim() &&
    (language === 'en-US'
      ? /[\u3400-\u9fff]/.test(text)
      : !/[\u3400-\u9fff]/.test(text) && /[A-Za-z]+\s+[A-Za-z]+/.test(text))
  );
}
const displayKeys =
  /^(title|subtitle|name|label|hint|description|body|text|content|message|reply|answer|question|reason|summary|note|intro|detail|error|statusLabel|emptyText|caption|lines|options|choices|paragraphs|welcome|previewText)$/i;
const excludedKeys =
  /password|token|secret|username|nickname|initial|authorName|fileName|files|email|phone|input|query|draft|translations|locale|preferences|value|style|url|src|path/i;
function collect(data, selected = false, depth = 0, view) {
  if (depth > 10 || !data) return;
  if (typeof data === 'string') {
    if (!selected || !needs(data)) return;
    view?.__localeSources?.add(data);
    if (Object.prototype.hasOwnProperty.call(cache, data)) return;
    const known = ui(data);
    if (known !== data) {
      cache[data] = known;
      if (!timer) timer = setTimeout(flush, 120);
    } else if (Date.now() >= cooldown) {
      pending.add(data);
      if (!timer) timer = setTimeout(flush, 180);
    }
  } else if (Array.isArray(data)) data.forEach((item) => collect(item, selected, depth + 1, view));
  else if (typeof data === 'object')
    for (const [key, value] of Object.entries(data))
      if (!excludedKeys.test(key))
        collect(value, displayKeys.test(key) || visibleFields.has(key), depth + 1, view);
}
async function translate(texts, administrator = false) {
  const stamp = epoch,
    result = texts.map((value) => (typeof value === 'string' ? value : String(value ?? '')));
  await refreshEditorial();
  if (stamp !== epoch) return result;
  const missing = [...new Set(result)].filter(
    (text) => needs(text) && !Object.prototype.hasOwnProperty.call(cache, text),
  );
  const client = require(administrator ? './admin-api' : './api');
  for (let at = 0; at < missing.length && stamp === epoch;) {
    const batch = [];
    let size = 0;
    while (at < missing.length && batch.length < 40 && size + missing[at].length <= 8000) {
      const text = missing[at++];
      const known = ui(text);
      if (known !== text) cache[text] = known;
      else {
        batch.push(text);
        size += text.length;
      }
    }
    if (!batch.length) continue;
    try {
      const data = await client.request(
        administrator ? '/localization/translate' : '/api/localization/translate',
        'POST',
        { texts: batch, target: language },
      );
      if (stamp !== epoch) return result;
      if (!Array.isArray(data.texts) || data.texts.length !== batch.length)
        throw Error('Invalid translation response');
      batch.forEach((text, index) => {
        if (typeof data.texts[index] === 'string') cache[text] = data.texts[index];
      });
    } catch (_) {
      cooldown = Date.now() + 20000;
      break;
    }
  }
  // Ephemeral cache is discarded on account, backend or language changes.
  const keys = Object.keys(cache);
  for (const key of keys.slice(0, Math.max(0, keys.length - 400))) delete cache[key];
  return stamp === epoch ? result.map((text) => cache[text] || ui(text)) : result;
}
async function flush() {
  timer = null;
  if (working) return;
  working = true;
  const texts = [...pending];
  pending.clear();
  if (Date.now() >= cooldown && texts.length) await translate(texts, /:admin:/.test(scope));
  working = false;
  publish();
  if (pending.size && !timer && Date.now() >= cooldown) timer = setTimeout(flush, 180);
}
function attach(view, administrator = false) {
  if (view.__localeSetData) return;
  install();
  view.__localeDisposed = false;
  view.__localeActive = true;
  view.__localeSources = new Set();
  view.__localeSetData = view.setData.bind(view);
  view.setData = function (patch, callback) {
    view.__localeSetData(patch, callback);
    collect(patch, false, 0, view);
  };
  views.add(view);
  publishView(view);
  collect(view.data, false, 0, view);
}
function detach(view) {
  view.__localeDisposed = true;
  views.delete(view);
}
function toggleOriginal() {
  original = !original;
  publish();
}
function page(definition, administrator = false) {
  const load = definition.onLoad,
    unload = definition.onUnload,
    show = definition.onShow,
    hide = definition.onHide;
  definition.onLoad = function (...args) {
    attach(this, administrator);
    return load?.apply(this, args);
  };
  definition.onShow = function (...args) {
    attach(this, administrator);
    this.__localeActive = true;
    void refreshEditorial();
    const result = show?.apply(this, args);
    publishView(this);
    collect(this.data, false, 0, this);
    if (pageTitles[this.route]) wx.setNavigationBarTitle?.({ title: pageTitles[this.route] });
    return result;
  };
  definition.onHide = function (...args) {
    this.__localeActive = false;
    return hide?.apply(this, args);
  };
  definition.onUnload = function (...args) {
    detach(this);
    return unload?.apply(this, args);
  };
  definition.localeToggleOriginal = toggleOriginal;
  return definition;
}
function component(definition) {
  const lifetimes = definition.lifetimes || {},
    attached = lifetimes.attached,
    detached = lifetimes.detached;
  const pageLifetimes = definition.pageLifetimes || {},
    show = pageLifetimes.show,
    hide = pageLifetimes.hide;
  definition.pageLifetimes = {
    ...pageLifetimes,
    show(...args) {
      this.__localeActive = true;
      const result = show?.apply(this, args);
      publishView(this);
      collect(this.data, false, 0, this);
      return result;
    },
    hide(...args) {
      this.__localeActive = false;
      return hide?.apply(this, args);
    },
  };
  definition.lifetimes = {
    ...lifetimes,
    attached(...args) {
      attach(this, /:admin:/.test(scope));
      return attached?.apply(this, args);
    },
    detached(...args) {
      detach(this);
      return detached?.apply(this, args);
    },
  };
  return definition;
}
module.exports = {
  install,
  page,
  component,
  ui,
  translate,
  toggleOriginal,
  resolved,
  deviceLanguage,
};
