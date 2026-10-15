import {
  pointPickerHTML,
  createPointSelection,
  validateEditableForm,
  formFeedback,
} from '../map-selection.js';
import { $, api, esc, toast } from '/shared/ui.js';
import { campusMap, inCampus } from '/shared/map.js';
import { openCampusPanorama } from '/shared/campus-panorama.js';
import { openCampusModel } from '/shared/campus-model.js';
import { mapModelCalibrationHTML, setupMapModelCalibration } from '../map-model-calibration.js';

export function campusMapHTML() {
  return `<section class="campus-editor"><div class="campus-editor-title"><div><h2>校园本地化</h2><p>补充校园地点、校准校园地点的位置。未发布的编辑草稿仅管理端可见。</p></div><button class="button secondary" id="campus-panorama">实景全景</button><button class="button secondary" id="campus-model">三维校园</button><button class="button" id="campus-new">新增地点</button></div><div class="campus-editor-layout"><aside class="campus-editor-list"><input id="campus-query" type="search" placeholder="搜索楼号、学院或地点" aria-label="搜索校园地点"><div class="campus-editor-filters"><select id="campus-zone" aria-label="校区"><option value="">全部校区</option><option>东校区</option><option>西校区</option></select><select id="campus-category" aria-label="地点分类"><option value="">全部分类</option></select></div><p id="campus-list-status" role="status">正在载入地点…</p><div id="campus-place-list"></div></aside><div class="campus-editor-stage"><div class="admin-map-wrap"><div id="admin-campus-map" class="admin-campus-map" role="region" aria-label="校园地点标注地图"></div>${pointPickerHTML('campus')}</div><p class="campus-pick-tip" id="campus-pick-tip">选中地点后点击“在地图上选点”，连续调整后点 √ 确认。坐标按 WGS84 保存。</p>${mapModelCalibrationHTML()}<div id="campus-edit-form"><p>从列表选择一个地点，或新增地点。</p></div></div></div></section>`;
}

export function setupCampusEditor() {
  const root = $('.campus-editor');
  let disposed = false,
    map = null,
    data = null,
    active = null,
    loadGeneration = 0,
    mapLoading = null,
    dirty = false;
  const alive = () => !disposed && root.isConnected;
  const pickTip = () => {
    $('#campus-pick-tip', root).textContent = selection.selecting
      ? '可以连续点击地图调整位置，点 √ 确认后锁定。'
      : '位置已锁定；再次调整请点击“在地图上选点”。';
    $('#campus-confirm', root).hidden = !selection.selecting;
    $('#campus-pick', root).textContent = selection.selecting ? '正在选点' : '在地图上选点';
  };
  const fail = (message, form = $('#campus-place-form', root)) => {
    if (!alive()) return;
    if (form) formFeedback(form, message);
    toast(message);
  };
  const selection = createPointSelection({
    accepts: (p) => !!data && inCampus(p, data.campus),
    onError: fail,
    onMode: pickTip,
    onChange: (p) => {
      const form = $('#campus-place-form', root);
      if (!form) return;
      form.elements.lng.value = p.lng.toFixed(7);
      form.elements.lat.value = p.lat.toFixed(7);
      form.elements.confirmed.checked = false;
      dirty = true;
      map?.pick?.(p);
    },
    onConfirm: (p) => {
      const form = $('#campus-place-form', root);
      if (!form) return;
      form.elements.confirmed.checked = true;
      dirty = true;
      map?.pick?.(p);
      formFeedback(form, '选点已确认，点击保存或发布后生效。', { error: false, scroll: false });
      toast('选点已确认，保存后才会更新地点');
    },
  });
  const calibration = setupMapModelCalibration(root, {
    getMap: () => map,
    accepts: (p) => !!data && inCampus(p, data.campus),
    onBegin: () => {
      selection.reset();
      $('#campus-pick-tip', root).textContent =
        '模型选点请在下方确认；地点编辑与模型位置分别保存。';
    },
  });
  $('#campus-pick', root).onclick = () => {
    calibration.stopPicking();
    if (!active) {
      fail('请先选择或新增一个校园地点');
      return;
    }
    if (!map || map.provider === 'unavailable') {
      fail('地图尚不可用，可先手动填写经纬度');
      return;
    }
    const p = current();
    selection.begin({ lng: p.lng, lat: p.lat });
    map.pick?.(p);
  };
  $('#campus-confirm', root).onclick = () => selection.confirm();
  const fields = ['name', 'aliases', 'category', 'zone', 'lng', 'lat', 'description', 'source'];
  function current() {
    const form = $('#campus-place-form', root);
    if (!form) return active;
    const result = { ...active };
    for (const key of fields) {
      const value = form.elements[key].value;
      result[key] = ['lng', 'lat'].includes(key) ? Number(value) : value;
    }
    result.confirmed = form.elements.confirmed.checked;
    result.published = form.elements.published.checked;
    return result;
  }
  function edit(place) {
    if (dirty && !confirm('切换地点会放弃尚未保存的修改，继续吗？')) return;
    calibration.stopPicking();
    active = { ...place };
    dirty = false;
    selection.reset();
    map?.select(place.id, { pan: true });
    const input = (key, label, type = 'text', extra = '') =>
      `<label>${label}<input name="${key}" type="${type}" value="${esc(place[key] ?? '')}" ${extra}></label>`;
    const options = (key, label, values) =>
      `<label>${label}<select name="${key}">${values.map(([v, t]) => `<option value="${esc(v)}" ${v === place[key] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    $('#campus-edit-form', root).innerHTML =
      `<form id="campus-place-form" novalidate><h3>${esc(place.id ? '编辑校园地点' : '新增校园地点')}</h3><div class="campus-form-grid">${input('name', '地点名称', 'text', 'required maxlength="80"')}${input('aliases', '别名 / 学院名称', 'text', 'maxlength="300"')}${options(
        'zone',
        '校区',
        [
          ['东校区', '东校区'],
          ['西校区', '西校区'],
        ],
      )}${options(
        'category',
        '分类',
        data.categories.map((t) => [t, t]),
      )}${input('lng', '经度（WGS84）', 'number', 'required step="any"')}${input('lat', '纬度（WGS84）', 'number', 'required step="any"')}</div>${input('source', '资料来源 / 校准依据', 'text', 'required maxlength="300"')}<label>地点介绍<textarea name="description" maxlength="1000">${esc(place.description || '')}</textarea></label><div class="campus-confirm"><label><input type="checkbox" name="confirmed" ${place.confirmed ? 'checked' : ''}>我已核对并校准实际位置</label><label><input type="checkbox" name="published" ${place.published ? 'checked' : ''}>发布到用户端校园地点</label></div><p class="form-error" role="alert"></p><div class="button-row"><button type="submit" class="button">保存地点</button><button type="submit" class="button secondary" data-publish="true">发布地点</button></div></form>`;
    const form = $('#campus-place-form', root);
    form.oninput = (e) => {
      dirty = true;
      const feedback = $('.form-error', form);
      if (!feedback.classList.contains('form-success')) feedback.textContent = '';
      if (['lng', 'lat'].includes(e.target.name)) {
        selection.reset();
        form.elements.confirmed.checked = false;
        $('#campus-pick-tip', root).textContent = '坐标已手动修改，请核对位置并勾选确认后保存。';
      }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const buttons = form.querySelectorAll('[type=submit]');
      buttons.forEach((b) => (b.disabled = true));
      $('.form-error', form).textContent = '';
      if (e.submitter?.dataset.publish) form.elements.published.checked = true;
      try {
        selection.validate();
        validateEditableForm(form);
        const value = current();
        const payload = Object.fromEntries(
          [...fields, 'confirmed', 'published'].map((k) => [k, value[k]]),
        );
        payload.revision = place.revision || 0;
        const response = await api(
          '/api/admin/campus-map/places' + (place.id ? '/' + encodeURIComponent(place.id) : ''),
          place.id ? 'PATCH' : 'POST',
          payload,
        );
        if (!alive()) return;
        dirty = false;
        edit(response.place);
        formFeedback(
          $('#campus-place-form', root),
          response.place.published
            ? '地点已发布，用户端可查看。'
            : '地点已保存；尚未发布到用户端。',
          { error: false },
        );
        toast(response.place.published ? '校园地点已发布' : '校园地点已保存');
        load(response.place.id).catch((error) => {
          if (alive()) toast('保存已成功，地图刷新失败：' + error.message);
        });
      } catch (error) {
        fail(error.message, form);
      } finally {
        if (form.isConnected) buttons.forEach((b) => (b.disabled = false));
      }
    };
  }
  function filter() {
    if (!data || !alive()) return;
    const q = $('#campus-query', root).value.trim().toLowerCase(),
      zone = $('#campus-zone', root).value,
      category = $('#campus-category', root).value;
    const places = data.places.filter(
      (p) =>
        (!zone || p.zone === zone) &&
        (!category || p.category === category) &&
        [p.name, p.aliases, p.description].join(' ').toLowerCase().includes(q),
    );
    $('#campus-list-status', root).textContent = places.length + ' 个校园地点';
    $('#campus-place-list', root).innerHTML =
      places
        .map(
          (p) =>
            `<button type="button" data-campus-place="${esc(p.id)}" class="campus-place-row"><strong>${esc(p.name)}</strong><small>${esc(p.zone + ' · ' + p.category)} <span class="${p.published ? 'campus-published' : 'campus-draft'}">${p.published ? '已发布' : p.confirmed ? '已确认 · 草稿' : '待校准'}</span></small><span>${esc(p.aliases || '')}</span></button>`,
        )
        .join('') || '<p>没有匹配的地点。</p>';
    root
      .querySelectorAll('[data-campus-place]')
      .forEach(
        (b) => (b.onclick = () => edit(data.places.find((p) => p.id === b.dataset.campusPlace))),
      );
    map?.filter?.(places.map((p) => p.id));
  }
  async function load(selectId) {
    const generation = ++loadGeneration;
    const next = await api('/api/admin/campus-map');
    if (!alive() || generation !== loadGeneration) return;
    if (mapLoading) await mapLoading;
    if (!alive() || generation !== loadGeneration) return;
    data = next;
    map?.destroy();
    map = null;
    $('#campus-category', root).innerHTML =
      '<option value="">全部分类</option>' +
      data.categories.map((t) => `<option>${esc(t)}</option>`).join('');
    filter();
    if (selectId && !dirty && active?.id === selectId) {
      const saved = data.places.find((p) => p.id === selectId);
      if (saved) active = { ...saved };
    }
    const pendingMap = campusMap(
      $('#admin-campus-map', root),
      { ...data, points: data.places },
      {
        onPoint: (id) => {
          if (!alive() || generation !== loadGeneration) return;
          const p = data.places.find((p) => p.id === id);
          if (p)
            calibration.selecting
              ? calibration.pick(p)
              : selection.selecting
                ? selection.accept(p)
                : edit(p);
        },
        canPick: () =>
          alive() &&
          generation === loadGeneration &&
          (selection.selecting || calibration.selecting),
        onPick: (p) => (calibration.selecting ? calibration.pick(p) : selection.accept(p)),
        mapModelsEndpoint: '/api/admin/campus-map/map-models',
      },
    );
    mapLoading = pendingMap;
    let nextMap;
    try {
      nextMap = await pendingMap;
    } finally {
      if (mapLoading === pendingMap) mapLoading = null;
    }
    if (!alive() || generation !== loadGeneration) {
      nextMap.destroy();
      return;
    }
    map = nextMap;
    filter();
    if (active) {
      map.select?.(active.id);
      map.pick?.(current());
    }
  }
  $('#campus-panorama', root).onclick = openCampusPanorama;
  $('#campus-model', root).onclick = () => openCampusModel('/api/admin/campus-map/photo-model');
  $('#campus-new', root).onclick = () => {
    if (!data) return;
    edit({
      name: '',
      aliases: '',
      category: '楼宇',
      zone: '东校区',
      lng: 106.1,
      lat: 38.4968,
      description: '',
      source: '现场校准',
      revision: 0,
      confirmed: false,
      published: false,
    });
  };
  ['campus-query', 'campus-zone', 'campus-category'].forEach((id) =>
    $('#' + id, root).addEventListener('input', filter),
  );
  const unload = (e) => {
    if (dirty || calibration.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', unload);
  load().catch((e) => {
    if (alive()) $('#campus-list-status', root).textContent = e.message;
  });
  return () => {
    disposed = true;
    calibration.destroy();
    map?.destroy();
    window.removeEventListener('beforeunload', unload);
  };
}
