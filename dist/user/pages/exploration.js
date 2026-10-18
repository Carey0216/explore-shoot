import { showPassportEvents } from '../rewards.js';
import { thumbnail } from '/shared/ui.js';
import { providerName, providerCopy, mapConfigured } from '/shared/map-provider.js';
import { locationFor } from '/shared/tencent-location.js';
import { $, esc, api, icon, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
import { campusMap, inCampus } from '/shared/map.js';
import { navigationPanel, bindNavigation, stopNavigation } from '/shared/navigation.js';
import { localSearchHTML, bindLocalSearch } from '../search.js';
import { bindDraftForm } from '/shared/drafts.js';

// 探索路线、进行中的任务与轨迹交互。业务规则与权限由 Java 接口处理。
export function createExplorationPages({
  state,
  heading,
  cover,
  bindCollectionSearch,
  requireAccount,
  pointDialog,
  loadPrivate,
  accountDraft,
  bindPoints,
  draftPhoto,
}) {
  let routeRevision = 0;
  let watch = null,
    trackLast = 0,
    trackingLocation = null;
  function preferenceGroup(label, key, values) {
    return `<div><label>${label}</label><div class="chips">${values.map(([value, text]) => `<button class="chip ${state.preferences[key] === value ? 'active' : ''}" data-pref="${key}" data-value="${value}">${text}</button>`).join('')}</div></div>`;
  }

  async function routePage() {
    const revision = ++routeRevision,
      p = { ...state.preferences },
      query = state.localQuery,
      focusSearch = document.activeElement === $('#routes-search input'),
      caret = document.activeElement?.selectionStart,
      plans = await api('/api/plan', 'POST', { ...p, query });
    if (state.page !== 'routes' || revision !== routeRevision) return;
    $('#main').innerHTML =
      `${heading()}${state.active ? `<div class="notice" style="margin-bottom:20px">你有一段尚未结束的探索：${esc(state.active.routeName)} <a href="#active" class="text-btn">继续探索</a></div>` : ''}<div class="route-layout"><section class="preference-box">${localSearchHTML('routes-search', '搜索本页路线或途经点位', state.localQuery)}<h3>今天想怎么走？</h3>${preferenceGroup(
        '留出多少时间',
        'budget',
        [
          [15, '15 分钟'],
          [20, '20 分钟'],
          [30, '30 分钟'],
        ],
      )}${preferenceGroup('和谁一起', 'people', [
        [1, '一个人'],
        [2, '两个人'],
      ])}${preferenceGroup('步行节奏', 'intensity', [
        ['轻松', '轻松'],
        ['适中', '适中'],
      ])}<label>想拍什么<select id="route-theme">${['全部', '建筑', '自然', '人文', '运动'].map((t) => `<option ${p.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>探索方式<select id="route-mode"><option value="fixed" ${p.mode === 'fixed' ? 'selected' : ''}>跟着拍摄任务走</option><option value="guide" ${p.mode === 'guide' ? 'selected' : ''}>只看点位导览</option><option value="personal" ${p.mode === 'personal' ? 'selected' : ''}>按偏好匹配任务</option></select></label><p class="muted">时间含步行、拍摄与 20% 余量。当前路线时间为估算。</p></section><div class="route-list"><p id="routes-search-empty" class="page-filter-empty" ${!plans.length && query ? '' : 'hidden'}>没有找到这条路线，试试其他关键词。</p>${plans
        .map((r, i) => {
          const point = state.catalog.points.find((p) => p.id === r.points[0]);
          return `<article class="route-card" data-search-text="${esc([r.name, r.theme, ...r.points.map((id) => state.catalog.points.find((p) => p.id === id)?.name || '')].join(' '))}"><img class="route-image" src="${esc(thumbnail(cover(point || {})))}" alt="北方民族大学校园参考配图"><div class="route-content"><span class="pill ${r.match ? 'green' : ''}">${esc(r.theme)} · ${esc(r.intensity)}步行</span><h2>${esc(r.name)}</h2><p class="route-path">${r.stops.map((p) => esc(p.name)).join(' / ')}</p><p class="muted">步行 ${r.walk} 分钟 + 拍摄 ${r.stay} 分钟 + 余量 ${r.buffer} 分钟</p><div class="route-bottom"><span class="route-time"><strong>${r.total}</strong>分钟 · ${r.points.length} 个点位</span><button class="button secondary" data-route-preview="${r.id}">查看路线</button><button class="button ${r.available ? '' : 'secondary'}" data-start="${r.id}" ${r.available ? '' : 'disabled'}>${r.available ? '就走这条' : '暂不可开始'}</button></div>${r.reason ? `<p class="muted" style="margin:12px 0 0">${esc(r.reason)}</p>` : ''}</div></article>`;
        })
        .join(
          '',
        )}<p class="muted">配图为校园参考照片。拍摄任务来自已审核模板；按偏好匹配暂未连接 AI 模型。</p></div></div>`;
    let searchTimer;
    const searchForm = $('#routes-search');
    const searchInput = searchForm.querySelector('input');
    bindLocalSearch(
      searchForm,
      (q) => {
        if (q === state.localQuery) return;
        state.localQuery = q;
        routeRevision++;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          if (state.page === 'routes' && searchForm.isConnected)
            routePage().catch((e) => toast(e.message));
        }, 180);
      },
      state.localQuery,
    );
    if (focusSearch) {
      searchInput.focus();
      searchInput.setSelectionRange?.(caret, caret);
    }
    document
      .querySelectorAll('[data-route-preview]')
      .forEach(
        (b) => (b.onclick = () => routePreview(plans.find((r) => r.id === b.dataset.routePreview))),
      );
    document.querySelectorAll('[data-pref]').forEach(
      (b) =>
        (b.onclick = () => {
          state.preferences[b.dataset.pref] = ['budget', 'people'].includes(b.dataset.pref)
            ? Number(b.dataset.value)
            : b.dataset.value;
          routePage().catch((e) => toast(e.message));
        }),
    );
    $('#route-theme').onchange = (e) => {
      p.theme = e.target.value;
      routePage().catch((e) => toast(e.message));
    };
    $('#route-mode').onchange = (e) => {
      p.mode = e.target.value;
      routePage().catch((e) => toast(e.message));
    };
    document.querySelectorAll('[data-start]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!(await requireAccount())) return;
          try {
            b.disabled = true;
            state.active = await api('/api/sessions', 'POST', {
              routeId: b.dataset.start,
              preferences: p,
            });
            location.hash = 'active';
            toast('小路已经准备好，出发吧');
          } catch (e) {
            toast(e.message);
            b.disabled = false;
          }
        }),
    );
  }

  function routePreview(route) {
    const stops = route.points
      .map((id) => state.catalog.points.find((p) => p.id === id))
      .filter(Boolean);
    modal(
      route.name,
      `<div id="route-preview-map" class="map-canvas" aria-label="步行路线预览"></div><ol class="route-stops">${stops.map((p, i) => `<li><b>${i + 1}</b><span>${esc(p.name)}</span></li>`).join('')}</ol><p id="route-preview-distance" class="muted">正在请求${providerName(state.catalog).replace('地图', '')}步行路线…</p><p class="muted">蓝线由${providerName(state.catalog).replace('地图', '')}步行服务规划，请以现场入口和通行条件为准。</p>`,
      (d) => {
        let map;
        campusMap(
          $('#route-preview-map', d),
          { ...state.catalog, points: stops },
          { onPoint: pointDialog, routeStops: stops },
        )
          .then((m) => {
            if (!d.isConnected) {
              m.destroy();
              return;
            }
            map = m;
            m.referenceReady?.then(() => {
              if (!d.isConnected) return;
              $('#route-preview-distance', d).textContent = m.reference.missing
                ? m.reference.reason || providerCopy('部分腾讯路线暂不可用', state.catalog)
                : providerCopy('腾讯规划：点位间步行约 ', state.catalog) +
                  Math.round(m.reference.length) +
                  ' 米';
            });
          })
          .catch((e) => toast(e.message));
        return () => map?.destroy();
      },
    );
  }

  function stopTracking() {
    if (watch !== null) {
      trackingLocation?.clearWatch(watch);
      watch = null;
      trackingLocation = null;
    }
  }

  function startTracking() {
    if (!state.active || state.active.status !== 'active') {
      toast('请先恢复探索，再记录轨迹');
      return;
    }
    if (!mapConfigured(state.catalog)) {
      toast(providerCopy('腾讯地图尚未配置，请联系管理员', state.catalog));
      return;
    }
    if (watch !== null) {
      stopTracking();
      activePage();
      toast('轨迹记录已停止');
      return;
    }
    const sessionId = state.active.id;
    trackingLocation = locationFor(state.catalog);
    watch = trackingLocation.watchPosition(
      async (pos) => {
        if (
          watch === null ||
          state.page !== 'active' ||
          state.active?.id !== sessionId ||
          state.active.status !== 'active'
        )
          return;
        const p = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          at: Math.round(pos.timestamp),
        };
        state.map?.locate(p);
        if (p.accuracy > 200) {
          $('#track-message') &&
            ($('#track-message').textContent = '定位精度较低，等待更准确的位置…');
          return;
        }
        if (!inCampus(p, state.catalog.campus)) {
          if ($('#track-message'))
            $('#track-message').textContent = '当前位置不在校园内，暂不记录轨迹。';
          return;
        }
        if (p.at <= trackLast + 3000) return;
        trackLast = p.at;
        try {
          await api('/api/sessions/' + sessionId + '/track', 'POST', { points: [p] });
          if (state.active?.id !== sessionId) return;
          if (!state.active.track.some((x) => x.at === p.at)) state.active.track.push(p);
          state.map?.trail(state.active.track);
          if ($('#track-message'))
            $('#track-message').textContent =
              `正在记录 · ${state.active.track.length} 个轨迹点 · 精度约 ${Math.round(p.accuracy)} 米`;
        } catch (e) {
          toast(e.message);
          stopTracking();
          if ($('#track-message')) $('#track-message').textContent = '轨迹记录已停止。';
        }
      },
      (e) => {
        stopTracking();
        toast(e.code === 1 ? '定位权限未开启，请在浏览器设置中允许' : '定位暂时不可用，已停止记录');
        activePage();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    toast('已请求定位，将只记录校园内的实时位置');
    activePage();
  }

  async function sessionAction(body) {
    try {
      const id = state.active.id;
      state.active = await api('/api/sessions/' + id, 'PATCH', body);
      state.sessions = state.sessions.map((s) => (s.id === id ? state.active : s));
      const passportEvents = state.active.passportEvents;
      await loadPrivate();
      await showPassportEvents(passportEvents);
      if (['pause', 'finish', 'exit'].includes(body.action)) {
        stopTracking();
        stopNavigation();
      }
      if (['finish', 'exit'].includes(body.action)) {
        await loadPrivate();
        location.hash = 'notes';
        toast(body.action === 'finish' ? '这一段探索，已收进手记' : '探索已结束，记录已保留');
      } else {
        await activePage();
        if (body.action === 'task') {
          toast(body.status === 'done' ? '又收集到了一个校园瞬间' : '已记录跳过原因');
          const main = $('#main');
          main.classList.remove('celebrate');
          void main.offsetWidth;
          main.classList.add('celebrate');
          setTimeout(() => main.classList.remove('celebrate'), 450);
        }
      }
      return true;
    } catch (e) {
      toast(e.message);
      if (body.action === 'photo') throw e;
      return false;
    }
  }

  function skipDialog(task) {
    modal(
      '这一次，先跳过',
      `<form id="skip-form"><p class="muted">${esc(task.pointName)}</p><label>为什么跳过？<textarea name="reason" required maxlength="300" placeholder="例如：入口暂时关闭、现场人太多…"></textarea></label>${errorHTML}<button class="button wide" type="submit">记录并跳过</button></form>`,
      (d) => {
        const draft = bindDraftForm(
          $('#skip-form', d),
          accountDraft('skip:' + state.active.id + ':' + task.id),
          ['reason'],
        );
        $('#skip-form', d).onsubmit = (e) =>
          formSubmit(e, async (f) => {
            if (
              await sessionAction({
                action: 'task',
                taskId: task.id,
                status: 'skipped',
                reason: f.reason,
              })
            ) {
              await draft.clear().catch(() => {});
              closeModal();
            } else throw Error('跳过原因未提交，请重试；本机草稿仍会保留。');
          });
        return () => draft.destroy();
      },
    );
  }

  function activePage() {
    state.taskDraftCleanups?.forEach((fn) => fn());
    state.taskDraftCleanups = [];
    const s = state.active;
    if (!s || !state.account) {
      stopTracking();
      stopNavigation();
      $('#main').innerHTML =
        `${heading()}<div class="empty">还没有正在进行的探索。<br><a href="#routes" class="button" style="margin-top:18px">选一条小路</a></div>`;
      return;
    }
    if (s.status !== 'active' || s.blocked?.length) {
      stopTracking();
      stopNavigation();
    }
    const done = s.tasks.filter((t) => t.status !== 'pending').length;
    $('#main').innerHTML =
      `${heading()}<section class="active-top"><div style="flex:1"><span class="eyebrow">YOUR CAMPUS WALK</span><h2 style="margin-top:12px">${esc(s.routeName)}</h2><span class="muted">${s.status === 'paused' ? '已暂停' : '正在探索'} · ${s.preferences.people} 人 · ${s.plan.total} 分钟预算内计划</span><div class="progress"><span style="width:${(done / s.tasks.length) * 100}%"></span></div><small class="muted">已收集 ${done} / ${s.tasks.length} 个点位 · 完成情况由你自己记录</small></div><div class="button-row"><button class="button secondary" id="pause">${s.status === 'paused' ? '继续探索' : '先歇一会'}</button><button class="text-btn" id="end-early">结束这次探索</button></div></section>${s.blocked?.length ? `<p class="notice">${esc(s.blocked.join('、'))} 已下线。请结束本次探索，选择其他开放点位。</p>` : ''}<div class="active-layout"><div>${localSearchHTML('active-search', '搜索本页拍摄任务', state.localQuery)}<p id="active-search-empty" class="page-filter-empty" hidden>没有匹配的任务。</p>${s.tasks.map((t, i) => `<article class="task-card ${t.status === 'done' ? 'done' : ''}"><div class="task-top"><span class="task-number">${t.status === 'done' ? icon('check') : i + 1}</span><h3>${esc(t.pointName)}</h3><span class="pill ${t.status === 'done' ? 'green' : ''}" style="margin-left:auto">${t.status === 'done' ? '已完成' : t.status === 'skipped' ? '已跳过' : '待探索'}</span></div><h4>${esc(t.title)}</h4><ol>${t.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>${t.reason ? `<p class="muted">跳过原因：${esc(t.reason)}</p>` : ''}${t.mediaId ? `<img src="/media/${t.mediaId}" alt="我的探索照片">` : ''}<div class="button-row">${t.status === 'pending' ? `<button class="button" data-done="${t.id}" ${s.status !== 'active' || s.blocked?.length ? 'disabled' : ''}>${icon('check')} 收集这一刻</button><button class="button secondary" data-skip="${t.id}" ${s.status !== 'active' || s.blocked?.length ? 'disabled' : ''}>跳过</button>` : ''}<button class="button secondary" data-photo="${t.id}">${icon('camera')} ${t.mediaId ? '更换照片' : '拍一张'}</button><button class="text-btn" data-point="${t.pointId}">查看点位</button></div></article>`).join('')}<button class="button wide dark" id="finish" ${done < s.tasks.length ? 'disabled' : ''}>把这段探索收进手记</button></div><aside class="trail-panel">${navigationPanel(s, state.catalog)}<button class="button secondary wide" id="tracking">${icon('pin')} ${watch === null ? '开启实时轨迹' : '停止记录轨迹'}</button><p id="track-message" class="muted" style="margin-top:13px">${watch !== null ? '<span class="tracking-dot"></span>正在定位并记录' : s.track.length ? '已记录 ' + s.track.length + ' 个轨迹点' : '只有开启后才会记录位置。离开本页面会停止记录。'}</p><p class="muted">轨迹与拍摄照片仅当前账号可见。${providerName(state.catalog).replace('地图', '')}处理定位信息；开启记录后轨迹保存到项目服务器，地图显示时${providerName(state.catalog).replace('地图', '')}处理轨迹坐标。未开启定位也可以完成拍摄任务。</p></aside></div>`;
    bindCollectionSearch('active-search', '.task-card');
    bindPoints();
    $('#pause').onclick = () =>
      sessionAction({ action: s.status === 'paused' ? 'resume' : 'pause' });
    $('#end-early').onclick = () =>
      modal(
        '结束这次探索？',
        '<p class="muted">已完成的任务和照片会保存在探索手记中。</p><button class="button wide" id="confirm-exit">结束并保留记录</button>',
        (d) => {
          $('#confirm-exit', d).onclick = () => {
            closeModal();
            sessionAction({ action: 'exit' });
          };
        },
      );
    $('#finish').onclick = () => sessionAction({ action: 'finish' });
    $('#tracking').onclick = startTracking;
    document
      .querySelectorAll('[data-done]')
      .forEach(
        (b) =>
          (b.onclick = () =>
            sessionAction({ action: 'task', taskId: b.dataset.done, status: 'done' })),
      );
    document
      .querySelectorAll('[data-skip]')
      .forEach((b) => (b.onclick = () => skipDialog(s.tasks.find((t) => t.id === b.dataset.skip))));
    document.querySelectorAll('[data-photo]').forEach(
      (b) =>
        (b.onclick = () =>
          draftPhoto(
            async (m) => {
              if (state.active?.id !== s.id) throw Error('探索记录已切换，请重新打开原记录后提交');
              await sessionAction({ action: 'photo', taskId: b.dataset.photo, mediaId: m.id });
            },
            'photo:' + s.id + ':' + b.dataset.photo,
            { confirmedMediaId: s.tasks.find((t) => t.id === b.dataset.photo)?.mediaId },
          )),
    );
    decoratePhotoDrafts(s);
    const el = $('#trail-map');
    state.map?.destroy();
    state.map = null;
    campusMap(
      el,
      {
        ...state.catalog,
        points: state.catalog.points.filter((p) => s.tasks.some((t) => t.pointId === p.id)),
      },
      {
        onPoint: pointDialog,
        trail: s.track,
        routeStops: s.tasks
          .map((t) => state.catalog.points.find((p) => p.id === t.pointId))
          .filter(Boolean),
      },
    )
      .then((m) => {
        if (el.isConnected) {
          state.map = m;
          bindNavigation(s, state.catalog, m);
        } else m.destroy();
      })
      .catch((e) => toast(e.message));
  }

  function decoratePhotoDrafts(session) {
    document.querySelectorAll('[data-photo]').forEach((button) => {
      const task = session.tasks.find((t) => t.id === button.dataset.photo);
      const draft = accountDraft('photo:' + session.id + ':' + task.id);
      const hint = document.createElement('small');
      hint.className = 'task-draft-hint';
      hint.hidden = true;
      hint.textContent = '有一张照片草稿仅存本机 · 点击拍摄按钮可恢复';
      button.closest('.button-row').before(hint);
      let restored = false;
      const unsubscribe = draft.subscribe(({ phase }) => {
        if (phase === 'saved') restored = true;
        if (['empty', 'submitted'].includes(phase)) hint.hidden = true;
        else if (restored && ['saved', 'restored'].includes(phase)) hint.hidden = false;
      });
      state.taskDraftCleanups.push(unsubscribe);
      draft
        .read()
        .then((data) => {
          if (!button.isConnected) return;
          restored = !!data.photo && data.uploaded?.id !== task.mediaId;
          hint.hidden = !restored;
        })
        .catch(() => {});
    });
  }
  return {
    preferenceGroup,
    routePage,
    routePreview,
    stopTracking,
    startTracking,
    sessionAction,
    skipDialog,
    activePage,
    decoratePhotoDrafts,
  };
}
