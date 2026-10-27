import { $, api, esc, toast, modal, formSubmit, closeModal, errorHTML } from '/shared/ui.js';
import { setPhotoTask } from './task-flow.js';
// The saved list remains the source of truth; opening navigation does not mark a stop complete.
export async function mountNextStop(host, plan, alive) {
  const item = plan.items.find((i) => !i.done);
  if (!item) {
    host.innerHTML =
      '<p class="muted">这份计划已走完。真实打卡与照片可以继续在我的内容中查看。</p>';
    return;
  }
  host.innerHTML = `<span class="eyebrow">下一站</span><h3>${esc(item.title)}</h3><p data-next-status>正在核对开放信息…</p>`;
  try {
    const spot = await api('/api/shooting-spots/' + encodeURIComponent(item.spotId));
    if (!alive() || !host.isConnected) return;
    const closed = spot.pointOpen === false || spot.availability === 'closed';
    host.innerHTML = `<span class="eyebrow">下一站 · 停留约 ${Number(item.minutes || 5)} 分钟</span><h3>${esc(item.title)}</h3><p>${closed ? '当前关闭，请换一站' : esc(spot.openingHours || '开放时间待核对，请先查看地点说明')}</p><small>全程粗估 ${Number(plan.schedule?.estimatedMinutes || 0)} 分钟，以实际导航为准。</small><div class="button-row"><button type="button" class="button" data-next-go ${closed ? 'disabled' : ''}>导航出发</button><a class="button secondary" href="#spot/${esc(item.spotId)}" data-next-arrive>我已到达 · 去取景</a><a class="text-btn" href="#checkin/${esc(spot.pointId)}?spot=${esc(item.spotId)}" data-next-record>拍好了，去记录 ↗</a></div>`;
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
      $('[data-next-status]', host).textContent = e.message + ' · 已保存的计划不受影响';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'text-btn';
      retry.textContent = '重试开放检查';
      retry.onclick = () => void mountNextStop(host, plan, alive);
      host.append(retry);
    }
  }
}
export function replacePlanStop(plan, index, points, save) {
  modal(
    '给这一站换个机位',
    `<form id="replace-stop813"><label>地点<select name="point">${points.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label>机位<select name="spot" required></select></label><p data-replace-hint role="status"></p>${errorHTML}<button class="button" type="submit" disabled>替换这一站</button></form>`,
    (d) => {
      const form = $('form', d);
      let spots = [],
        serial = 0;
      const load = async () => {
        const at = ++serial;
        form.querySelector('[type=submit]').disabled = true;
        form.elements.spot.innerHTML = '';
        $('[data-replace-hint]', d).textContent = '正在读取地点机位…';
        try {
          const data = await api(
            '/api/points/' + encodeURIComponent(form.elements.point.value) + '/shooting-spots',
          );
          if (!d.isConnected || at !== serial) return;
          spots = data.items || data.spots || [];
          form.elements.spot.innerHTML = spots
            .map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`)
            .join('');
          $('[data-replace-hint]', d).textContent = spots.length
            ? '只替换这一站，其他顺序和构图保留。'
            : '这里尚无已发布机位，可以换一个地点';
          form.querySelector('[type=submit]').disabled = !spots.length;
        } catch (e) {
          if (at === serial) $('[data-replace-hint]', d).textContent = e.message;
        }
      };
      form.elements.point.onchange = load;
      void load();
      form.onsubmit = (e) =>
        formSubmit(e, async () => {
          const s = spots.find((s) => s.id === form.elements.spot.value);
          if (!s) throw Error('请先选择机位');
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
