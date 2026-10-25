import { $, api, esc, icon, toast } from '/shared/ui.js';
import { getPreferenceAccountId } from '/shared/preferences.js';
import { featureVisible, allowFeature } from '/shared/features.js';
const prefix = 'jingyu-photo-task81:';
const key = () => prefix + location.origin + ':' + (getPreferenceAccountId() || 'guest');
export function photoTask() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key()) || 'null');
    return saved && Date.now() - saved.updatedAt < 86400000 ? saved : null;
  } catch {
    return null;
  }
}
export function setPhotoTask(spot, stage = 'prepare') {
  const old = photoTask();
  const next = {
    pointId: spot.pointId,
    spotId: spot.id,
    title: spot.title,
    stage,
    source: old?.spotId === spot.id ? old.source : location.hash,
    updatedAt: Date.now(),
  };
  sessionStorage.setItem(key(), JSON.stringify(next));
  window.dispatchEvent(new Event('photo-task:change'));
  return next;
}
export function completePhotoTask(pointId) {
  if (photoTask()?.pointId === pointId) sessionStorage.removeItem(key());
}
export function installTaskFlow(getState, { navigate, framing }) {
  let serial = 0,
    host;
  const draw = async () => {
    const stamp = ++serial,
      state = getState(),
      page = state.page,
      owner = state.account?.id;
    host?.remove();
    host = null;
    document.body.classList.remove('task-managed81');
    if (!['spot', 'place', 'navigate', 'map'].includes(page)) return;
    const saved = photoTask();
    let spotId = page === 'spot' ? state.placeId : state.spotId || saved?.spotId;
    if (!spotId) return;
    try {
      const spot = await api('/api/shooting-spots/' + encodeURIComponent(spotId));
      if (stamp !== serial || getState().page !== page || getState().account?.id !== owner) return;
      if (['place', 'checkin'].includes(page) && spot.pointId !== state.placeId) return;
      const task = saved?.spotId === spot.id ? saved : null,
        stage = task?.stage || 'browse';
      host = document.createElement('section');
      host.className = 'task-flow81';
      host.dataset.taskSpot = spot.id;
      const closed = spot.availability === 'closed' || spot.pointOpen === false;
      const message = closed
        ? '机位当前关闭，出发前请重新核对。'
        : stage === 'arrived'
          ? '已经到达？先稳住画面，再留下自己的照片。'
          : stage === 'captured'
            ? '照片拍好了，把地点和这一刻一起记下来。'
            : stage === 'prepare'
              ? '先看路线与开放情况，到达后再打开取景辅助。'
              : '从这张照片出发，把想拍的画面一步步带回去。';
      const mainFeature =
        stage === 'arrived' ? 'framing' : stage === 'captured' ? 'publishing' : 'exploration';
      const primary =
        stage === 'arrived' ? '取景辅助' : stage === 'captured' ? '记录这张照片' : '准备出发';
      host.innerHTML = `<header><h2>${esc(spot.title)} · ${stage === 'arrived' ? '正在拍摄' : stage === 'captured' ? '拍完之后' : '这次拍摄'}</h2>${task ? '<button class="text-btn" data-task-clear aria-label="结束这次拍摄">×</button>' : ''}</header><p>${message}${spot.openingHours ? ' ' + esc(spot.openingHours) : ' 开放时间待核对。'}</p><div class="button-row">${featureVisible(mainFeature) ? `<button class="button" data-task-main data-feature="${mainFeature}" ${closed ? 'disabled' : ''}>${icon(stage === 'captured' ? 'camera' : stage === 'arrived' ? 'camera' : 'walk')} ${primary}</button>` : ''}${stage === 'prepare' ? '<button class="button secondary" data-task-arrived>我已到达</button>' : stage === 'arrived' && featureVisible('publishing') ? '<button class="button secondary" data-task-captured>拍好了，去记录</button>' : ''}${featureVisible('plans') ? '<a class="text-btn" data-feature="plans" href="#plans">拍摄计划 ↗</a>' : ''}${task?.source && /^#(discover|shots|topic|spot|place)(\/|$)/.test(task.source) ? `<a class="text-btn" href="${esc(task.source)}">回到发现 ↗</a>` : ''}</div>`;
      const intro = $('.shooting-detail>header') || $('.place-detail-sheet h1');
      if (intro) intro.after(host);
      else $('#main').prepend(host);
      document.body.classList.add('task-managed81');
      $('[data-task-clear]', host)?.addEventListener('click', () => {
        sessionStorage.removeItem(key());
        void draw();
      });
      $('[data-task-arrived]', host)?.addEventListener('click', () =>
        setPhotoTask(spot, 'arrived'),
      );
      const capture = () => {
        if (!allowFeature('publishing')) return;
        setPhotoTask(spot, 'captured');
        location.hash = 'checkin/' + spot.pointId + '?spot=' + spot.id;
      };
      $('[data-task-captured]', host)?.addEventListener('click', capture);
      $('[data-task-main]', host)?.addEventListener('click', () => {
        if (stage === 'arrived') {
          if (allowFeature('framing')) framing(spot);
        } else if (stage === 'captured') capture();
        else {
          if (!allowFeature('exploration')) return;
          setPhotoTask(spot, 'prepare');
          navigate(spot.pointId, { ...spot, id: spot.pointId, name: spot.title, open: true });
        }
      });
    } catch (e) {
      if (stamp === serial && page === 'spot') toast(e.message);
    }
  };
  document.addEventListener('campus:page-ready', draw);
  window.addEventListener('photo-task:change', draw);
}
