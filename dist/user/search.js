import { getPreferenceAccountId } from '/shared/preferences.js';
import { $, esc, icon, api } from '/shared/ui.js';

export const cleanQuery = (value) =>
  String(value ?? '')
    .trim()
    .slice(0, 100);
const aliases = {
  library: '图书馆',
  図書館: '图书馆',
  圖書館: '图书馆',
  architecture: '建筑',
  building: '建筑',
  建築: '建筑',
  建物: '建筑',
  nature: '自然',
  sport: '运动',
  sports: '运动',
  スポーツ: '运动',
  運動: '运动',
  life: '人文',
};
const normalizedQuery = (value) => {
  const q = cleanQuery(value).normalize('NFKC').toLocaleLowerCase();
  return aliases[q] || q;
};
export const matchesText = (text, query) =>
  String(text).normalize('NFKC').toLocaleLowerCase().includes(normalizedQuery(query));
export function matchingPoints(points, query) {
  const q = normalizedQuery(query);
  return points.filter(
    (p) =>
      !q ||
      [p.name, p.description, p.theme].join(' ').normalize('NFKC').toLocaleLowerCase().includes(q),
  );
}
const recentKey = () => 'jingyu-recent-search-v81:' + (getPreferenceAccountId() || 'guest');
function recentSearches() {
  try {
    return JSON.parse(localStorage.getItem(recentKey()) || '[]')
      .filter((s) => typeof s === 'string')
      .slice(0, 8);
  } catch {
    return [];
  }
}
function saveRecent(query) {
  const q = cleanQuery(query);
  if (!q) return;
  try {
    localStorage.setItem(
      recentKey(),
      JSON.stringify([q, ...recentSearches().filter((s) => s !== q)].slice(0, 8)),
    );
  } catch {}
}
export function searchHTML(query) {
  return `<section class="search-page" aria-labelledby="search-title"><a href="#discover" class="button secondary search-back">← 返回发现</a><header class="search-heading"><h1 id="search-title">搜索校园点位</h1></header><form id="campus-search-form" class="campus-search-form" role="search"><div class="campus-search-field">${icon('search')}<input id="campus-search-input" name="q" type="search" aria-label="搜索校园点位" placeholder="搜索点位名称、主题或描述" maxlength="100" enterkeyhint="search" autocomplete="off" value="${esc(query)}"><button id="search-clear" class="icon-btn" type="button" aria-label="清除搜索关键词" ${query ? '' : 'hidden'}>${icon('close')}</button></div><button class="button search-submit" type="submit">搜索</button></form><div class="search-suggestions" aria-label="快捷搜索"><span>试试搜索</span>${['图书馆', '建筑', '自然', '运动'].map((q) => `<button class="button secondary" type="button" data-search-term="${q}">${q}<span aria-hidden="true">↗</span></button>`).join('')}</div><div class="search-recent81" aria-label="最近搜索">${recentSearches()
    .map(
      (q) =>
        `<button type="button" class="button secondary small" data-search-term="${esc(q)}">${esc(q)}</button>`,
    )
    .join(
      '',
    )}${recentSearches().length ? '<button type="button" class="text-btn" id="search-clear-recent81">清除最近搜索</button>' : ''}</div><p id="search-result-status" class="search-result-status" role="status" aria-live="polite"></p><div id="search-results" aria-live="off"></div></section>`;
}
export function bindSearch({
  query,
  setQuery,
  points,
  card,
  bindCards,
  focus = false,
  search = null,
  snapshot = null,
  remember = () => {},
}) {
  const input = $('#campus-search-input'),
    clear = $('#search-clear'),
    form = $('#campus-search-form');
  if (input.value !== query) input.value = query;
  let revision = 0,
    timer;
  const update = () => {
    const q = cleanQuery(input.value);
    setQuery(q);
    clear.hidden = !input.value;
    const current = ++revision;
    const show = (found) => {
      remember({ query: q, points: found });
      if (current !== revision || (search && !input.isConnected)) return;
      $('#search-result-status').textContent = q
        ? `「${q}」 · 找到 ${found._total ?? found.length} 个校园点位`
        : '不知道从哪儿开始？先看看这些校园角落。';
      $('#search-results').innerHTML = found.length
        ? `<div class="feed-grid search-grid">${found.map(card).join('')}</div>`
        : `<div class="search-empty">${icon('search')}<h2>暂时没有找到这个地方</h2><p>试试简称、拼音或其他关键词。</p>${found._suggestions?.length ? `<p>你可能想找</p>${found._suggestions.map((p) => `<a class="button secondary" href="#place/${esc(p.id)}">${esc(p.name)} ↗</a>`).join('')}` : ''}<button id="search-reset" class="button secondary" type="button">重新搜索</button></div>`;
      bindCards($('#search-results'));
      if (found._hasMore) {
        const more = document.createElement('button');
        more.className = 'button secondary wide';
        more.textContent = '加载更多搜索结果';
        $('#search-results').append(more);
        more.onclick = async () => {
          more.disabled = true;
          try {
            const next = await search(q, 'all', '', { page: found._page + 1 });
            if (current !== revision || !input.isConnected) return;
            show(
              Object.assign([...found, ...next], {
                _page: next._page,
                _hasMore: next._hasMore,
                _total: next._total,
              }),
            );
          } catch (error) {
            $('#search-result-status').textContent = error.message;
            more.disabled = false;
          }
        };
      }
      $('#search-reset')?.addEventListener('click', () => {
        input.value = '';
        update();
        input.focus();
      });
    };
    if (!search) {
      show(q ? matchingPoints(points, q) : points);
      return;
    }
    if (snapshot?.query === q) {
      show(snapshot.points);
      snapshot = null;
      return;
    }
    clearTimeout(timer);
    $('#search-result-status').textContent = '正在搜索…';
    timer = setTimeout(async () => {
      try {
        show(await search(q));
      } catch (e) {
        if (current !== revision || !input.isConnected) return;
        $('#search-result-status').textContent = e.message;
        $('#search-results').innerHTML = '';
      }
    }, 180);
  };
  input.oninput = update;
  form.onsubmit = (e) => {
    e.preventDefault();
    saveRecent(input.value);
    update();
    input.blur();
  };
  $('#search-clear-recent81')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(recentKey());
    } catch {}
    $('.search-recent81').replaceChildren();
  });
  clear.onclick = () => {
    input.value = '';
    update();
    input.focus();
  };
  document.querySelectorAll('[data-search-term]').forEach(
    (b) =>
      (b.onclick = () => {
        input.value = b.dataset.searchTerm;
        saveRecent(input.value);
        update();
        input.blur();
      }),
  );
  update();
  if (focus) input.focus({ preventScroll: true });
  return () => {
    revision++;
    clearTimeout(timer);
  };
}

export function localSearchHTML(id, label, query = '') {
  return `<form id="${id}" class="local-search" role="search" aria-label="${esc(label)}"><div class="campus-search-field">${icon('search')}<input type="search" aria-label="${esc(label)}" placeholder="${esc(label)}" maxlength="100" autocomplete="off" enterkeyhint="search" value="${esc(query)}"><button class="icon-btn" type="button" aria-label="清除${esc(label)}" ${query ? '' : 'hidden'}>${icon('close')}</button></div></form>`;
}
export function bindLocalSearch(form, update, query = '') {
  if (!form) return;
  const input = form.querySelector('input'),
    clear = form.querySelector('button');
  input.value = query;
  const apply = () => {
    clear.hidden = !input.value;
    update(cleanQuery(input.value));
  };
  input.oninput = apply;
  clear.onclick = () => {
    input.value = '';
    apply();
    input.focus();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    apply();
    input.blur();
  };
  apply();
}
// Active filters stay with the route; recent submitted terms are local and scoped to the account.
export function resetPageSearch(state, page) {
  state.query = page === 'search' ? state.pendingSearchQuery || '' : '';
  state.pendingSearchQuery = '';
  state.localQuery = '';
  state.theme = '全部';
}

// Search rules and account filters are implemented by Java; the page only renders results.
export async function searchPoints(query = '', filter = 'all', condition = '', { page = 1 } = {}) {
  try {
    const result = await api('/api/points/search', 'POST', {
      query: cleanQuery(query),
      filter,
      ...(condition ? { condition } : {}),
      page,
      pageSize: 12,
    });
    return Object.assign(result.points, {
      _page: result.page,
      _hasMore: result.hasMore,
      _total: result.total,
      _suggestions: result.suggestions || [],
    });
  } catch (error) {
    if (!error.status) {
      const catalog = await api('/api/catalog');
      if (catalog._offline) {
        if (filter !== 'all' || condition)
          throw Error('离线时仅支持公开资料关键词浏览；附近、热门及条件筛选需要联网。');
        const list = catalog.points.filter((p) =>
          matchesText([p.name, p.description, p.theme].join(' '), query),
        );
        list._offline = true;
        return list;
      }
    }
    throw error;
  }
}
