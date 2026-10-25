import { mountSeasonMap } from './season-map.js';
import { badgeURL } from '/shared/badge-presets.js';
import { api, esc, icon, thumbnail } from '/shared/ui.js';
import { bindTopicReminders } from './workflow.js';

const phases = { active: '正在进行', upcoming: '即将开始', ended: '已结束' };
const themes = {
  spring: '春日校园',
  summer: '夏日校园',
  winter: '冬日校园',
  blossom: '花期',
  snow: '雪景',
  graduation: '毕业季',
  autumn: '秋色',
  night: '夜景',
  other: '校园活动',
};
export function activityDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '时间待确认'
    : d.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
}
export function activityCover(t, catalog) {
  const p = t.points.map((p) => catalog?.points?.find((x) => x.id === p.id)).find((p) => p?.cover);
  return { url: p?.cover || '/shared/nmu-campus.jpg', credit: p ? '关联地点配图' : '校园参考配图' };
}
export function activityCard(t, catalog) {
  const cover = activityCover(t, catalog);
  return `<a class="activity-row" href="#topic/${encodeURIComponent(t.id)}"><div class="activity-poster"><img src="${esc(thumbnail(cover.url))}" alt="${cover.credit}" loading="lazy"><span>${esc(themes[t.theme] || themes.other)}</span></div><div><span class="pill">${phases[t.phase] || ''}</span><h2>${esc(t.title)}</h2><p>${activityDate(t.startsAt)} — ${activityDate(t.endsAt)}</p><p>${t.points.length} 个关联地点 · ${t.stamps.length} 枚主题印章</p><span class="activity-enter">查看活动 ${icon('arrow')}</span></div></a>`;
}
export async function mountActivities({ root, state, alive, requireAccount }) {
  const { items } = await api('/api/topics');
  if (!alive()) return;
  if (state.page === 'topic') {
    const t = items.find((t) => t.id === state.placeId);
    if (!t) {
      root.innerHTML =
        '<a class="page-back" data-context-back href="#topics">← 活动</a><p class="empty">活动已下线或不存在。</p>';
      return;
    }
    const cover = activityCover(t, state.catalog);
    const visited = new Set(t.visitedPointIds || []),
      completed = t.points.filter((p) => visited.has(p.id)).length;
    const next = t.phase === 'active' ? t.points.find((p) => !visited.has(p.id)) : null;
    const progress = t.points.length ? Math.round((completed / t.points.length) * 100) : 0;
    root.innerHTML = `<a class="page-back" data-context-back href="#topics">← 活动</a><div class="activity-detail-hero"><img src="${esc(cover.url)}" alt="${cover.credit}"><small>${cover.credit} · 非活动现场照片</small></div><article class="activity-detail-body"><span class="pill">${phases[t.phase]}</span><h1>${esc(t.title)}</h1><dl class="activity-facts"><dt>时间</dt><dd>${activityDate(t.startsAt)}<br>至 ${activityDate(t.endsAt)}</dd><dt>主题</dt><dd>${esc(themes[t.theme] || themes.other)}</dd><dt>足迹</dt><dd>活动期间你已打卡 ${t.visited} 个地点</dd></dl>${t.points.length ? `<section class="topic-next73"><h2>${completed === t.points.length ? '这段足迹，已经留下' : t.phase === 'active' ? '从下一站开始' : t.phase === 'upcoming' ? '先收下一份出发计划' : '回看这次校园探索'}</h2><progress value="${completed}" max="${t.points.length}" aria-label="活动真实打卡进度"></progress><p class="muted">真实打卡 ${completed} / ${t.points.length} · ${progress}%</p>${next ? `<a class="button" href="#place/${encodeURIComponent(next.id)}?activity=${encodeURIComponent(t.id)}" data-activity-place>下一站 · ${esc(next.name)} ${icon('arrow')}</a>` : ''}</section>` : ''}<p class="activity-description">${esc(t.description)}</p><div class="activity-actions">${t.phase !== 'ended' ? `<button class="button" data-topic-reminder="${esc(t.id)}">提醒我参加</button>` : ''}<a class="button secondary" href="#passport">${icon('check')} 我的护照</a></div><details class="activity-details" open><summary>活动地点 · ${t.points.length}</summary><ul class="activity-locations">${t.points.map((p) => `<li><a href="#place/${encodeURIComponent(p.id)}?activity=${encodeURIComponent(t.id)}" data-activity-place><span>${esc(p.name)}</span><span>查看 ↗</span></a></li>`).join('') || '<li class="muted">按校园真实打卡统计，暂无单独指定地点。</li>'}</ul></details><details class="activity-details" open><summary>主题印章 · ${t.stamps.length}</summary><div class="activity-stamps">${t.stamps.map(activityStamp).join('') || '<p class="muted">暂未关联主题印章。</p>'}</div><p class="muted">按活动期间真实打卡统计，完成拍摄计划不代替打卡。</p></details></article>`;
    root.querySelectorAll('[data-activity-place]').forEach((a) =>
      a.addEventListener('click', () => {
        const [path, query] = a.getAttribute('href').split('?');
        const params = new URLSearchParams(query);
        params.set('activityEntry', crypto.randomUUID());
        a.href = path + '?' + params;
      }),
    );
    await bindTopicReminders(root, state.account, requireAccount);
    return;
  }
  root.innerHTML = `<section class="discovery-heading"><h1>校园活动</h1><span class="muted">${items.length} 个专题</span></section><div id="season-map81"></div><div class="activity-toolbar"><input id="activity-search" class="activity-search" type="search" maxlength="100" placeholder="搜索活动名称、主题" aria-label="搜索活动"><div class="activity-filters" aria-label="活动时间">${[['all', '全部'], ...Object.entries(phases)].map(([id, label]) => `<button data-activity-phase="${id}" aria-pressed="${id === 'all'}">${label}</button>`).join('')}</div></div><div class="activity-list" id="activity-list"></div>`;
  const seasonCleanup = mountSeasonMap(root.querySelector('#season-map81'), items, state.catalog);
  let phase = 'all';
  const update = () => {
    const query = root.querySelector('#activity-search').value.trim().toLowerCase();
    const selected = items.filter(
      (t) =>
        (phase === 'all' || t.phase === phase) &&
        `${t.title} ${t.description} ${themes[t.theme] || ''}`.toLowerCase().includes(query),
    );
    root.querySelector('#activity-list').innerHTML =
      selected.map((t) => activityCard(t, state.catalog)).join('') ||
      '<p class="empty">暂无匹配的活动。</p>';
  };
  root.querySelector('#activity-search').oninput = update;
  root.querySelectorAll('[data-activity-phase]').forEach(
    (b) =>
      (b.onclick = () => {
        phase = b.dataset.activityPhase;
        root
          .querySelectorAll('[data-activity-phase]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        update();
      }),
  );
  update();
  return seasonCleanup;
}

export function activityStamp(stamp) {
  return `<article class="activity-stamp ${stamp.earned ? 'is-earned' : ''}"><img src="${badgeURL(stamp.badgePreset)}" alt="${esc(stamp.title)}印章${stamp.earned ? '，已获得' : '，未获得'}" width="44" height="44"><div><strong>${esc(stamp.title)}</strong><small>${stamp.earned ? '已获得' : `进度 ${Number(stamp.progress)} / ${Number(stamp.target)}`}</small></div></article>`;
}
