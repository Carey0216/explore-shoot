import { $, api, esc, toast, modal, formSubmit, closeModal, errorHTML } from '/shared/ui.js';
import { setPhotoTask } from './task-flow.js';
import { isPlaceStop, planStopHref } from './plan-stop.js';
// The saved list remains the source of truth; opening navigation does not mark a stop complete.
export async function mountNextStop(host, plan, alive, replace) {
  const item = plan.items.find((i) => !i.done);
  if (!item) {
    host.innerHTML =
      '<p class="muted">这份计划已走完。真实打卡与照片可以继续在我的内容中查看。</p>';
    return;
  }
  const showConflict = (message) => {
    host.innerHTML = `<span class="eyebrow">下一站需要调整</span><h3>${esc(item.title)}</h3><p role="status">${esc(message)}</p><button type="button" class="button" data-next-replace>替换这一站</button>`;
    $('[data-next-replace]', host).onclick = () => replace(plan.items.indexOf(item));
  };
  const conflict = plan.schedule?.warnings?.find(
    (w) => w.itemId === item.id && w.level === 'conflict',
  );
  if (conflict) return showConflict(conflict.message);
  host.innerHTML = `<span class="eyebrow">下一站</span><h3>${esc(item.title)}</h3><p data-next-status>正在核对开放信息…</p>`;
  if (isPlaceStop(item)) {
    host.innerHTML = `<span class="eyebrow">下一站 · 校园地点</span><h3>${esc(item.title)}</h3><p>请确认开放信息，到达地点附近后自行取景。</p><div class="button-row"><button type="button" class="button" data-next-go>导航出发</button><a class="button secondary" href="${planStopHref(item)}">查看地点</a><a class="text-btn" href="#checkin/${encodeURIComponent(item.pointId)}">拍好了，去记录 ↗</a></div>`;
    $('[data-next-go]', host).onclick = () =>
      window.dispatchEvent(
        new CustomEvent('navigation:destination', { detail: { id: item.pointId } }),
      );
    return;
  }
  try {
    const spot = await api('/api/shooting-spots/' + encodeURIComponent(item.spotId));
    if (!alive() || !host.isConnected) return;
    if (spot.pointOpen === false || spot.availability === 'closed')
      return showConflict('这一站当前标记为关闭。');
    host.innerHTML = `<span class="eyebrow">下一站 · 停留约 ${Number(item.minutes || 5)} 分钟</span><h3>${esc(item.title)}</h3><p>${esc(spot.openingHours || '开放时间待核对，请先查看地点说明')}</p><small>全程粗估 ${Number(plan.schedule?.estimatedMinutes || 0)} 分钟，以实际导航为准。</small><div class="button-row"><button type="button" class="button" data-next-go>导航出发</button><a class="button secondary" href="#spot/${esc(item.spotId)}" data-next-arrive>我已到达 · 去取景</a><a class="text-btn" href="#checkin/${esc(spot.pointId)}?spot=${esc(item.spotId)}" data-next-record>拍好了，去记录 ↗</a></div>`;
    $('[data-next-go]', host).onclick = () => {
      setPhotoTask(spot, 'prepare');
      window.dispatchEvent(
        new CustomEvent('navigation:destination', { detail: { id: spot.pointId } }),
      );
    };
    $('[data-next-arrive]', host).onclick = () => setPhotoTask(spot, 'arrived');
    $('[data-next-record]', host).onclick = () => setPhotoTask(spot, 'captured');
  } catch (e) {
    if (alive() && host.isConnected) {
      if (e.status === 404) return showConflict('这一站已下线，请重新选择。');
      $('[data-next-status]', host).textContent = e.message + ' · 已保存的计划不受影响';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'text-btn';
      retry.textContent = '重试开放检查';
      retry.onclick = () => void mountNextStop(host, plan, alive, replace);
      host.append(retry);
    }
  }
}
export function replacePlanStop(plan, index, points, save) {
  points = points.filter((point) => point.open !== false);
  modal(
    '替换这一站',
    `<form id="replace-stop813"><label>地点<select name="point">${points.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label>站点<select name="spot" required></select></label><p data-replace-hint role="status"></p>${errorHTML}<button class="button" type="submit" disabled>替换这一站</button></form>`,
    (d) => {
      const form = $('form', d);
      let spots = [],
        serial = 0;
      const load = async () => {
        const at = ++serial;
        spots = [];
        form.querySelector('[type=submit]').disabled = true;
        form.elements.spot.innerHTML = '';
        $('[data-replace-hint]', d).textContent = '正在读取地点机位…';
        try {
          const point = points.find((item) => item.id === form.elements.point.value);
          if (!point) {
            $('[data-replace-hint]', d).textContent = '当前没有可前往的地点';
            return;
          }
          const data = await api(
            '/api/points/' + encodeURIComponent(form.elements.point.value) + '/shooting-spots',
          );
          if (!d.isConnected || at !== serial) return;
          spots = (data.items || data.spots || []).filter((item) => item.availability !== 'closed');
          if (!spots.length)
            spots.push({ id: 'point:' + point.id, pointId: point.id, title: point.name });
          form.elements.spot.innerHTML = spots
            .map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`)
            .join('');
          $('[data-replace-hint]', d).textContent = spots[0].id.startsWith('point:')
            ? '这个地点暂无公开机位，选作地点站后请到现场自行取景。'
            : '只替换这一站，其他顺序和构图保留。';
          form.querySelector('[type=submit]').disabled = false;
        } catch (e) {
          if (at === serial) $('[data-replace-hint]', d).textContent = e.message;
        }
      };
      form.elements.point.onchange = load;
      void load();
      form.onsubmit = (e) =>
        formSubmit(e, async () => {
          const s = spots.find((s) => s.id === form.elements.spot.value);
          if (!s) throw Error('请先选择站点');
          plan.items[index] = {
            ...plan.items[index],
            spotId: s.id,
            title: s.title,
            pointId: s.pointId,
            composition: '',
            done: false,
          };
          if ((await save(plan)) === false) throw Error('未保存安排已留在本机，请重试保存');
          closeModal();
        });
    },
  );
}
