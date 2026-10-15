import { spotCardHTML } from './shooting.js';
import { reactionHTML } from '/shared/point-reactions.js';
import { recordPointView } from './point-views.js';
import {
  $,
  thumbnail,
  esc,
  date,
  icon,
  api,
  toast,
  photoPicker,
  prepareDraftPhoto,
  discardDraftPhoto,
  releaseDraftUpload,
  photoUploadStatus,
  modal,
  closeModal,
  formSubmit,
  errorHTML,
} from '/shared/ui.js';
import { localDraft, bindDraftForm, draftNotice } from '/shared/drafts.js';
import { locationFor } from '/shared/tencent-location.js';
import { sortNearby, distance } from './checkin-model.js';
import { searchPoints } from './search.js';
const options = [
  ['all', '综合'],
  ['nearby', '附近'],
  ['popular', '热门'],
  ['saved', '收藏'],
  ['unvisited', '待打卡'],
  ['visited', '已打卡'],
];
const back = '<a class="text-btn" href="#shots">← 打卡机位</a>';
const guides = (catalog, p) => catalog.templates.filter((t) => t.pointId === p.id && t.approved);
const photoCredit = (p) => (p.authorId && p.cover ? '探索官拍摄' : '校园参考配图 · 非该机位实拍');
function located(catalog, button, onSuccess, onFail = () => {}) {
  let cancel = null,
    disposed = false;
  button.disabled = true;
  cancel = locationFor(catalog).getCurrentPosition(
    (pos) => {
      if (disposed) return;
      button.disabled = false;
      onSuccess({
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
        accuracy: pos.coords.accuracy,
        at: pos.timestamp,
      });
    },
    (e) => {
      if (disposed) return;
      button.disabled = false;
      onFail();
      toast(e.code === 1 ? '未开启定位，也可以自主打卡' : '暂未取得可靠位置，请稍后再试');
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
  return () => {
    disposed = true;
    cancel?.();
  };
}
export function mountCheckinPage({
  state,
  cover,
  bindPoints,
  requireAccount,
  reload,
  goNavigate,
  report,
  showMap,
}) {
  const main = $('#main'),
    catalog = state.catalog,
    records = state.records || [],
    summary = state.passport || {
      visits: 0,
      unique: 0,
      current: 0,
      total: catalog.points.length,
      photos: 0,
      ids: new Set(),
    };
  let disposed = false,
    cancel = null,
    draftBinding = null,
    searchTimer = null,
    searchRevision = 0,
    reactionCleanup = null,
    communityCleanup = null;
  const cleanup = () => {
    disposed = true;
    searchRevision++;
    clearTimeout(searchTimer);
    cancel?.();
    draftBinding?.destroy();
    reactionCleanup?.();
    communityCleanup?.();
  };
  const bind = () => {
    bindPoints(main);
    main.querySelectorAll('[data-shot-id]').forEach(
      (b) =>
        (b.onclick = () => {
          location.hash =
            'place/' + b.dataset.point + '?shot=' + encodeURIComponent(b.dataset.shotId);
        }),
    );
    main.querySelectorAll('[data-checkin]').forEach(
      (b) =>
        (b.onclick = () => {
          location.hash = 'checkin/' + b.dataset.checkin;
        }),
    );
  };
  if (state.page === 'shots') {
    main.innerHTML = `<section class="shoot-heading shoot-list-heading"><h1>机位</h1><a class="text-btn" href="#passport">${icon('book')} 打卡足迹 ↗</a></section><section class="shoot-browser"><div class="shot-search-row"><form class="shot-search" role="search">${icon('search')}<input id="shot-query" aria-label="搜索地点与拍摄建议" maxlength="100" placeholder="搜地点，也可以搜拍法"><button class="icon-btn" type="button" id="shot-clear" aria-label="清除机位搜索">${icon('close')}</button></form><a class="button secondary shot-map-entry" href="#map">${icon('map')} 机位地图</a></div><div class="chips" role="group" aria-label="筛选打卡点位">${options.map(([id, label]) => `<button class="chip ${id === 'all' ? 'active' : ''}" data-shot-filter="${id}">${label}</button>`).join('')}</div><div class="chips condition-filters" role="group" aria-label="拍照条件筛选">${[
      ['', '全部条件'],
      ['night', '夜景'],
      ['portrait', '人像'],
      ['architecture', '建筑'],
      ['rain', '雨天'],
      ['solo', '适合独自拍'],
    ]
      .map(
        ([id, text]) =>
          `<button type="button" class="chip ${id ? '' : 'active'}" data-shot-condition="${id}">${text}</button>`,
      )
      .join(
        '',
      )}</div><div class="shot-location"><span id="shot-location-status">开启定位，可按离你近的点位排序。</span><button class="button secondary small" id="shot-locate">${icon('pin')} 开启定位</button></div><p class="muted" id="shot-count" role="status"></p><div id="shot-places"></div></section>`;
    let condition = '';
    let filter = 'all',
      position = null;
    const draw = () => {
      const query = $('#shot-query').value,
        current = ++searchRevision;
      clearTimeout(searchTimer);
      $('#shot-count').textContent = '正在搜索…';
      searchTimer = setTimeout(async () => {
        try {
          const results = await searchPoints(query, filter, condition);
          if (disposed || current !== searchRevision) return;
          const places = sortNearby(results, filter === 'nearby' ? position : null);
          $('#shot-count').textContent = `${places.length} 个地点`;
          $('#shot-places').innerHTML =
            places
              .map((p) => {
                const gs = guides(catalog, p);
                return `<article class="shot-place"><div class="shot-place-head"><div><button class="card-title" data-point="${p.id}">${esc(p.name)} <span aria-hidden="true">↗</span></button><p class="muted">${esc(p.theme)} · ${p.spotCount ? p.spotCount + ' 个真实机位' : gs.length + ' 个拍摄建议'} ${position ? '· ' + Math.round(distance(position, p)) + ' 米（直线）' : ''}</p></div><button class="icon-btn bookmark ${state.account?.bookmarks?.includes(p.id) ? 'saved' : ''}" data-save="${p.id}" aria-label="收藏${esc(p.name)}">${icon('heart')}</button></div>${p.matchingSpots?.length ? `<div class="shooting-spot-grid shots-real-spots">${p.matchingSpots.map(spotCardHTML).join('')}</div>` : `<div class="shot-angles">${(gs.length ? gs : [{ title: '记录自己的一个好角度' }]).map((t, i) => `<button class="shot-angle" data-point="${p.id}" ${t.id ? `data-shot-id="${t.id}"` : ''}><img src="${esc(thumbnail(cover(p)))}" alt="${esc(p.name)}校园参考图" loading="lazy"><span class="shot-angle-number">${String(i + 1).padStart(2, '0')}</span><span class="shot-angle-title" title="${esc(t.title)}">${esc(t.title)}</span></button>`).join('')}</div><span class="shot-photo-credit">${photoCredit(p)}</span>`}${reactionHTML(p)}<div class="shot-place-foot"><span class="pill ${summary.ids.has(p.id) ? 'green' : ''}">${summary.ids.has(p.id) ? '我已打卡' : p.open ? '等待你的第一张' : '暂时关闭'}</span><button class="button small" data-checkin="${p.id}" ${p.open ? '' : 'disabled'}>${icon('camera')} 去打卡</button><button class="text-btn" data-route-to="${p.id}" ${p.open ? '' : 'disabled'}>到这里去 ↗</button></div></article>`;
              })
              .join('') || '<div class="empty">还没有匹配的地点。试试其他关键词或分类。</div>';
          bind();
        } catch (e) {
          if (disposed || current !== searchRevision) return;
          $('#shot-count').textContent = e.message;
          $('#shot-places').innerHTML = '';
        }
      }, 180);
    };
    main.querySelectorAll('[data-shot-condition]').forEach(
      (b) =>
        (b.onclick = () => {
          condition = b.dataset.shotCondition;
          main
            .querySelectorAll('[data-shot-condition]')
            .forEach((x) => x.classList.toggle('active', x === b));
          draw();
        }),
    );
    window.addEventListener('point:reaction', draw);
    reactionCleanup = () => window.removeEventListener('point:reaction', draw);
    $('#shot-query').oninput = draw;
    $('.shot-search').onsubmit = (e) => {
      e.preventDefault();
      draw();
      $('#shot-query').blur();
    };
    $('#shot-clear').onclick = () => {
      $('#shot-query').value = '';
      draw();
      $('#shot-query').focus();
    };
    main.querySelectorAll('[data-shot-filter]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (
            ['saved', 'visited', 'unvisited'].includes(b.dataset.shotFilter) &&
            !(await requireAccount())
          )
            return;
          filter = b.dataset.shotFilter;
          main
            .querySelectorAll('[data-shot-filter]')
            .forEach((x) => x.classList.toggle('active', x === b));
          draw();
          if (filter === 'nearby' && !position) $('#shot-locate').click();
        }),
    );
    $('#shot-locate').onclick = () => {
      cancel?.();
      $('#shot-location-status').textContent = '正在获取新位置…';
      cancel = located(
        catalog,
        $('#shot-locate'),
        (p) => {
          position = p;
          $('#shot-location-status').textContent =
            `精度约 ${Math.round(p.accuracy)} 米 · 距离为直线参考，不保存位置`;
          filter = 'nearby';
          main
            .querySelectorAll('[data-shot-filter]')
            .forEach((b) => b.classList.toggle('active', b.dataset.shotFilter === filter));
          draw();
        },
        () => {
          $('#shot-location-status').textContent = '未取得可靠位置，仍可浏览全部地点。';
        },
      );
    };
    draw();
    return cleanup;
  }
  if (state.page === 'passport') {
    main.innerHTML = `${back}<section class="shoot-heading"><span class="eyebrow">MY CAMPUS / PASSPORT</span><h1>校园打卡护照</h1><p>你的打卡、照片和小小发现，仅自己可见。</p></section>${!state.account ? '<div class="empty"><h2>把校园收进自己的足迹</h2><p>登录后，在不同设备查看已提交的打卡。</p><button class="button" id="passport-login">登录 / 注册</button></div>' : `<section class="passport-summary"><div><b>${summary.unique}</b><span>去过的地点</span></div><div><b>${summary.visits}</b><span>留下的打卡</span></div><div><b>${summary.photos}</b><span>带照片的记录</span></div></section><section class="passport-progress"><div><strong>校园打卡进度</strong><span>${summary.current} / ${summary.total} 个当前点位</span></div><progress max="${Math.max(1, summary.total)}" value="${summary.current}" aria-label="校园打卡进度"></progress><p class="muted">包括已完成的探索任务；跳过任务不计入。重复到访也值得记录，下线地点的旧记录仍保留。</p></section><div id="passport-expansion"></div><div class="checkin-timeline">${records.map((c) => `<article class="checkin-record"><div class="checkin-date">${date(c.createdAt)}${c.legacyTime ? ' · 探索记录时间' : ''}</div><div class="checkin-record-body">${c.mediaId ? `<a class="private-photo-link" href="/media/${c.mediaId}" target="_blank" rel="noopener" aria-label="查看照片大图"><img src="/media/${c.mediaId}?size=thumb" alt="我的打卡照片" loading="lazy" decoding="async"></a>` : ''}<div><h3 data-i18n-skip>${esc(c.pointName)}</h3><p data-i18n-skip>${esc(c.spotTitle || c.shotTitle || '自己的一个好角度')}</p>${c.note ? `<p class="checkin-note" data-i18n-skip>${esc(c.note)}</p>` : ''}<span class="pill">${c.kind === 'task' ? '探索任务 · 自主记录' : c.location?.nearby ? '附近定位 · 自主记录' : '自主记录'}</span><div class="button-row">${catalog.points.some((p) => p.id === c.pointId) ? `<button class="text-btn" data-point="${c.pointId}">查看地点 ↗</button>` : '<small class="muted">地点已下线，记录已保留</small>'}${c.kind === 'checkin' && c.mediaId ? `<button class="text-btn" data-share-checkin="${c.id}">公开到作品墙</button>` : ''}${c.kind === 'checkin' ? `<button class="text-btn" data-delete-checkin="${c.id}">删除记录</button>` : '<a class="text-btn" href="#notes">在探索手记中管理 ↗</a>'}</div></div></div></article>`).join('') || '<div class="empty">第一张打卡，从一个校园角落开始。<br><a class="button" href="#shots">找个地方，去打卡</a></div>'}</div>`}`;
    if (state.account)
      import('./passport.js')
        .then(({ mountPassport }) => {
          if (!disposed) communityCleanup = mountPassport($('#passport-expansion'), { state });
        })
        .catch((e) => {
          if (!disposed) toast(e.message);
        });
    $('#passport-login')?.addEventListener('click', requireAccount);
    bind();
    main.querySelectorAll('[data-share-checkin]').forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            const { shareCheckin } = await import('./shooting.js');
            if (!disposed)
              await shareCheckin(
                records.find((r) => r.id === b.dataset.shareCheckin),
                { state },
              );
          } catch (e) {
            if (!disposed) toast(e.message);
          }
        }),
    );
    main.querySelectorAll('[data-delete-checkin]').forEach(
      (b) =>
        (b.onclick = () =>
          modal(
            '删除这次打卡？',
            '<p>仅删除这次私人记录和不再被引用的照片，其他打卡与探索手记保留。删除后无法恢复。</p><button class="button danger" id="checkin-confirm-delete">确认删除</button>',
            (d) => {
              $('#checkin-confirm-delete', d).onclick = async () => {
                try {
                  await api('/api/checkins/' + b.dataset.deleteCheckin, 'DELETE');
                  await reload();
                  closeModal();
                  window.dispatchEvent(new HashChangeEvent('hashchange'));
                  toast('打卡记录已删除');
                } catch (e) {
                  toast(e.message);
                }
              };
            },
          )),
    );
    return cleanup;
  }
  const p = catalog.points.find((p) => p.id === state.placeId);
  if (!p) {
    main.innerHTML = back + '<div class="empty">这个地点已下线或不存在，请选择其他地点。</div>';
    return cleanup;
  }
  const gs = guides(catalog, p);
  if (state.page === 'place') {
    recordPointView(p);
    main.innerHTML = `${back}<article class="place-detail"><figure class="place-photo"><img src="${esc(thumbnail(cover(p)))}" alt="${esc(p.name)}校园参考图"><figcaption>${photoCredit(p)}</figcaption></figure><section><span class="eyebrow">${esc(p.theme)} / PHOTO SPOT</span><h1 data-i18n-skip>${esc(p.name)}</h1><p>${esc(p.description)}</p>${reactionHTML(p)}<div class="detail-meta"><span class="pill ${summary.ids.has(p.id) ? 'green' : ''}">${summary.ids.has(p.id) ? '我已打卡' : '待打卡'}</span><span class="pill">${p.open ? '可前往探索' : '暂时关闭'}</span></div><p class="muted">${esc(catalog.campus.address)} · 校园内<br>坐标为地点参考位置，不是精确拍摄站位。</p><div class="button-row"><a class="button" href="#checkin/${p.id}" ${p.open ? '' : 'aria-disabled="true"'}>${icon('camera')} 留下我的打卡</a><button class="button secondary" data-route-to="${p.id}" ${p.open ? '' : 'disabled'}>${icon('walk')} 到这里去</button><button class="button secondary" id="place-map">${icon('map')} 在地图上查看</button><button class="icon-btn" data-save="${p.id}" aria-label="收藏地点">${icon('heart')}</button></div></section><section class="place-guide">${state.account?.scoutStatus === 'approved' ? '<button class="text-btn" id="place-report">反馈点位问题</button>' : ''}<h2>拍摄建议</h2><p class="muted">拍摄建议共用该地点的位置；请在安全公共区域自行选择角度。</p>${gs.map((t, i) => `<details ${state.shotId ? (t.id === state.shotId ? 'open' : '') : i === 0 ? 'open' : ''}><summary><span>${String(i + 1).padStart(2, '0')}</span><strong data-i18n-skip>${esc(t.title)}</strong><small>约 ${t.minutes} 分钟</small></summary><ol>${t.steps.map((s) => `<li data-i18n-skip>${esc(s)}</li>`).join('')}</ol>${t.duo ? `<p class="muted" data-i18n-skip>${esc(t.duo)}</p>` : ''}<a class="text-btn" href="#checkin/${p.id}?shot=${encodeURIComponent(t.id)}">用这个拍法打卡 ↗</a></details>`).join('') || '<p>这里还没有审核过的拍摄建议，欢迎记录自己的角度。</p>'}<div class="detail-info"><b>拍摄前，留意这些</b><span data-i18n-skip>${esc(p.condition)}</span></div><p class="muted">${p.trust === 'certified' ? '已经过认证' : p.trust === 'community' ? '由社区共创者上传，请自行分辨' : '地图资料 · 待实地核验'} · ${esc(p.source)}</p></section></article>`;
    const community = document.createElement('div');
    community.className = 'place-community';
    $('.place-guide', main).before(community);
    import('./shooting.js')
      .then(({ mountPlaceCommunity }) => {
        if (!disposed)
          communityCleanup = mountPlaceCommunity(community, { point: p, state, requireAccount });
      })
      .catch((e) => {
        if (!disposed) community.textContent = e.message;
      });
    bind();
    $('#place-report')?.addEventListener('click', () => report(p));
    $('#place-map').onclick = () => showMap(p.id);
    return cleanup;
  }
  main.innerHTML = `${back}<section class="shoot-heading"><span class="eyebrow">ONE PLACE / ONE MOMENT</span><h1>记录打卡</h1><p data-i18n-skip>${esc(p.name)}</p></section>${!state.account ? '<div class="empty"><p>登录后，打卡会保存到自己的账号。</p><button class="button" id="checkin-login">登录 / 注册</button></div>' : !p.open ? '<div class="empty">点位暂时关闭，先换一个地方吧。</div>' : `<form id="checkin-form" class="checkin-form"><label>今天想怎么拍？<select name="templateId"><option value="">自己的一个好角度</option>${gs.map((t) => `<option value="${t.id}" ${state.shotId === t.id ? 'selected' : ''} data-i18n-skip>${esc(t.title)}</option>`).join('')}</select></label><div id="checkin-sharing-fields"><p class="muted">正在加载独立机位…</p></div><div class="checkin-photo"><img id="checkin-preview" alt="本次打卡照片" hidden><div class="button-row"><button type="button" class="button secondary" id="checkin-photo">${icon('camera')} 拍摄 / 选择照片</button><button type="button" class="text-btn" id="checkin-remove-photo" hidden>移除照片</button></div><p id="checkin-photo-state" class="muted" role="status">照片可选；也可以只写一段感受。</p></div><label>这一站的小发现<textarea name="note" maxlength="1000" rows="4" placeholder="今天的光、一个新角度，或者到访的小感受…"></textarea></label><div class="checkin-location"><span id="checkin-location-state">定位可选。自主记录不代表实地认证。</span><div class="button-row"><button type="button" class="button secondary small" id="checkin-locate">${icon('pin')} 附上附近定位</button><button type="button" class="text-btn" id="checkin-without-location" hidden>不使用定位</button></div></div><p class="muted">默认仅自己可见；只有主动申请公开且审核通过的照片才会进入作品墙。只保存距离和精度参考，不保存本次定位坐标。</p>${errorHTML}<button class="button wide" type="submit">${icon('check')} 收进打卡足迹</button></form>`}`;
  $('#checkin-login')?.addEventListener('click', requireAccount);
  const form = $('#checkin-form');
  if (!form) return cleanup;
  import('./shooting.js')
    .then(({ mountCheckinSharing }) => {
      if (!disposed)
        communityCleanup = mountCheckinSharing($('#checkin-sharing-fields'), {
          point: p,
          spotId: state.spotId,
        });
    })
    .catch((e) => {
      if (!disposed) $('#checkin-sharing-fields').textContent = e.message;
    });
  const accountId = state.account.id,
    draft = localDraft(accountId, 'checkin:' + p.id),
    photoDraft = localDraft(accountId, 'checkin-photo:' + p.id);
  photoDraft.reopen();
  let media = null,
    position = null,
    submissionId = crypto.randomUUID();
  const showPhoto = () => {
    const image = $('#checkin-preview');
    image.hidden = !media;
    if (media) image.src = media.preview || media.url || '/media/' + media.id;
    else image.removeAttribute('src');
    $('#checkin-remove-photo').hidden = !media;
    $('#checkin-photo-state').textContent = media
      ? media.id
        ? media.needsUploadCheck
          ? '本机照片已恢复 · 提交时检查原临时上传'
          : '临时照片已上传 · 打卡尚未提交'
        : media.locallySaved === false
          ? '照片暂留当前页面 · 提交打卡时上传'
          : '照片仅存本机 · 提交打卡时上传'
      : '照片可选；也可以只写一段感受。';
  };
  draftBinding = bindDraftForm(form, draft, ['note', 'templateId'], {
    noun: '打卡草稿',
    onRestore: async (data) => {
      submissionId = data.submissionId || submissionId;
      const photoData = await photoDraft.read();
      if (disposed) return;
      media = photoData.photo
        ? {
            ...(photoData.uploaded || {}),
            preview: photoData.photo,
            local: !photoData.uploaded?.id,
            needsUploadCheck: !!photoData.uploaded?.id,
          }
        : photoData.uploaded || null;
      if (!gs.some((t) => t.id === form.elements.templateId.value))
        form.elements.templateId.value = '';
      showPhoto();
      await draft.update({ submissionId });
    },
    onDiscard: async () => {
      await discardDraftPhoto(photoDraft);
      if (disposed) return;
      submissionId = crypto.randomUUID();
      media = null;
      position = null;
      showPhoto();
      $('#checkin-location-state').textContent = '定位可选。自主记录不代表实地认证。';
      $('#checkin-without-location').hidden = true;
    },
  });
  $('#checkin-photo').onclick = () =>
    photoPicker(
      async (photo) => {
        if (disposed || state.account?.id !== accountId)
          throw Error('页面或账号已改变，请重新打开打卡');
        media = photo;
        showPhoto();
      },
      {
        draft: photoDraft,
        notice: draftNotice(photoDraft, { noun: '照片' }),
        keepDraft: true,
        keepDraftLabel: '照片已选好，提交打卡时上传',
      },
    );
  $('#checkin-remove-photo').onclick = async () => {
    const previous = media;
    await photoDraft.update({ photo: null, uploaded: null });
    void releaseDraftUpload(previous);
    media = null;
    showPhoto();
  };
  $('#checkin-locate').onclick = () => {
    cancel?.();
    $('#checkin-location-state').textContent = '正在获取新位置…';
    cancel = located(
      catalog,
      $('#checkin-locate'),
      (fix) => {
        position = fix;
        const meters = Math.round(distance(fix, p));
        $('#checkin-location-state').textContent =
          `距点位约 ${meters} 米 · 精度约 ${Math.round(fix.accuracy)} 米 · ${meters <= 150 ? '附近定位参考' : '距离较远，不标记附近定位'}`;
        $('#checkin-without-location').hidden = false;
      },
      () => {
        $('#checkin-location-state').textContent = '未取得可靠位置，可以继续自主记录。';
      },
    );
  };
  $('#checkin-without-location').onclick = () => {
    cancel?.();
    position = null;
    $('#checkin-location-state').textContent = '本次使用自主记录，不附定位。';
    $('#checkin-without-location').hidden = true;
    $('#checkin-locate').disabled = false;
  };
  form.onsubmit = (e) =>
    formSubmit(e, async (fields) => {
      await draftBinding.ready;
      await draft.flush();
      await photoDraft.flush();
      if (disposed || state.account?.id !== accountId) throw Error('页面或账号已改变，请重新提交');
      const selected = media;
      const uploaded = media
        ? await prepareDraftPhoto(photoDraft, {
            fallback: selected,
            onProgress: (progress) => {
              if (!disposed && media === selected)
                $('#checkin-photo-state').textContent = photoUploadStatus(progress);
            },
          })
        : null;
      if (disposed || state.account?.id !== accountId || media !== selected)
        throw Error('页面、账号或照片已改变，请重新提交');
      media = uploaded;
      showPhoto();
      const record = await api('/api/checkins', 'POST', {
        accountId,
        pointId: p.id,
        templateId: fields.templateId || null,
        spotId: fields.spotId || null,
        shareToWall: fields.shareToWall === 'yes',
        publicCaption: fields.publicCaption || '',
        note: fields.note,
        mediaId: media?.id || null,
        location: position,
        submissionId,
      });
      if (state.account?.id !== accountId) return;
      await Promise.all([draftBinding.clear(), photoDraft.clear({ submitted: true })]).catch(() =>
        toast('已提交，但本机草稿清理失败，请稍后丢弃'),
      );
      await reload();
      if (!disposed) {
        location.hash = 'passport';
        toast('这一站，已收进你的打卡足迹');
      }
      return record;
    });
  return cleanup;
}
