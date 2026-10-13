import { $, api, toast } from '/shared/ui.js';
import { campusMap, inCampus } from '/shared/map.js';
import { pointPickerHTML, createPointSelection, formFeedback } from './map-selection.js';

export function pointEditMapHTML() {
  return `<div class="admin-point-map-section"><div class="admin-map-wrap"><div id="point-edit-map" class="admin-point-map" role="region" aria-label="编辑点位位置地图"></div>${pointPickerHTML('point-edit')}</div><p id="point-edit-map-status" class="campus-pick-tip" role="status">可手动填写经纬度，或在地图上选点。</p></div>`;
}

export function setupPointEditMap(dialog, form, point) {
  let disposed = false,
    map = null,
    campus = null;
  const alive = () => !disposed && dialog.isConnected;
  const position = () => ({
    lng: Number(form.elements.lng.value),
    lat: Number(form.elements.lat.value),
  });
  const begin = $('#point-edit-pick', dialog),
    confirm = $('#point-edit-confirm', dialog),
    status = $('#point-edit-map-status', dialog);
  const error = (message) => {
    if (alive()) {
      formFeedback(form, message);
      toast(message);
    }
  };
  const selection = createPointSelection({
    accepts: (p) => !!campus && inCampus(p, campus),
    onError: error,
    onMode: ({ selecting, hasPoint }) => {
      confirm.hidden = !selecting;
      confirm.disabled = !hasPoint;
      begin.textContent = selecting ? '正在选点' : '在地图上选点';
      status.textContent = selecting
        ? '可以连续点击地图调整位置，点 √ 后锁定。'
        : '位置已锁定；再次修改请点击“在地图上选点”。';
    },
    onChange: (p) => {
      form.elements.lng.value = p.lng.toFixed(7);
      form.elements.lat.value = p.lat.toFixed(7);
      map?.pick?.(p);
    },
    onConfirm: (p) => {
      map?.pick?.(p);
      toast('选点已确认，请保存资料与审核结果');
    },
  });
  begin.onclick = () => {
    if (!map || map.provider === 'unavailable') {
      error('地图尚不可用，可先手动填写经纬度');
      return;
    }
    selection.begin(position());
    map.pick?.(position());
  };
  confirm.onclick = () => selection.confirm();
  for (const key of ['lng', 'lat'])
    form.elements[key].addEventListener('input', () => {
      selection.reset();
      status.textContent = '经纬度已手动修改，请核对后保存。';
      map?.pick?.(position());
    });
  (async () => {
    const catalog = await api('/api/admin/campus-map');
    if (!alive()) return;
    campus = catalog.campus;
    const adapter = await campusMap(
      $('#point-edit-map', dialog),
      { ...catalog, points: [point] },
      {
        canPick: () => alive() && selection.selecting,
        onPick: (p) => selection.accept(p),
        onPoint: () => {
          if (selection.selecting) selection.accept(point);
        },
      },
    );
    if (!alive()) {
      adapter.destroy();
      return;
    }
    map = adapter;
    map.focus?.(point.id);
    status.textContent =
      map.provider === 'unavailable'
        ? '地图暂不可用，可手动填写经纬度。'
        : '可连续选点，点 √ 确认后保存。';
  })().catch((e) => {
    if (alive()) status.textContent = e.message + '；可手动填写经纬度。';
  });
  return {
    validate: () => selection.validate(),
    destroy() {
      disposed = true;
      map?.destroy();
    },
  };
}
