import { $, api, esc, toast } from '/shared/ui.js';
import { campusMap } from '/shared/map.js';
import { openCampusScene } from '/shared/campus-scene.js';

export function campusMapHTML() {
  return `<section class="campus-editor"><div class="campus-editor-title"><div><h2>校园本地化</h2><p>补充校园地点、校准图示位置与建筑外观。编辑草稿仅管理端可见；原图示建筑仍可用于公共示意。</p></div><button class="button secondary" id="campus-preview">预览模型</button><button class="button" id="campus-new">新增地点</button></div><div class="campus-editor-layout"><aside class="campus-editor-list"><input id="campus-query" type="search" placeholder="搜索楼号、学院或地点" aria-label="搜索校园地点"><div class="campus-editor-filters"><select id="campus-zone" aria-label="校区"><option value="">全部校区</option><option>东校区</option><option>西校区</option></select><select id="campus-category" aria-label="地点分类"><option value="">全部分类</option></select></div><p id="campus-list-status" role="status">正在载入地点…</p><div id="campus-place-list"></div></aside><div class="campus-editor-stage"><div id="admin-campus-map" class="admin-campus-map" role="region" aria-label="校园地点标注地图"></div><p class="campus-pick-tip" id="campus-pick-tip">选中地点后点击“地图选位置”，在地图上标注。坐标按 WGS84 保存。</p><div id="campus-edit-form"><p>从列表选择一个地点，或新增地点。</p></div></div></div></section>`;
}

export function setupCampusEditor() {
  const root = $('.campus-editor');
  let disposed = false,
    map = null,
    data = null,
    active = null,
    picking = false,
    dirty = false;
  const alive = () => !disposed && root.isConnected;
  const pickTip = () =>
    ($('#campus-pick-tip', root).textContent = picking
      ? '请在地图点击实际位置；选好后可继续调整，再保存。'
      : '坐标按 WGS84 保存；图示位置需校准确认后才能发布。');
  const fields = [
    'name',
    'aliases',
    'category',
    'zone',
    'lng',
    'lat',
    'description',
    'source',
    'height',
    'width',
    'depth',
    'roof',
    'rotation',
  ];
  function current() {
    const form = $('#campus-place-form', root);
    if (!form) return active;
    const result = { ...active };
    for (const key of fields) {
      const value = form.elements[key].value;
      result[key] = ['lng', 'lat', 'height', 'width', 'depth', 'rotation'].includes(key)
        ? Number(value)
        : value;
    }
    result.confirmed = form.elements.confirmed.checked;
    result.published = form.elements.published.checked;
    return result;
  }
  function edit(place) {
    if (dirty && !confirm('切换地点会放弃尚未保存的修改，继续吗？')) return;
    active = { ...place };
    dirty = false;
    picking = false;
    pickTip();
    map?.select(place.id, { pan: true });
    const input = (key, label, type = 'text', extra = '') =>
      `<label>${label}<input name="${key}" type="${type}" value="${esc(place[key] ?? '')}" ${extra}></label>`;
    const options = (key, label, values) =>
      `<label>${label}<select name="${key}">${values.map(([v, t]) => `<option value="${esc(v)}" ${v === place[key] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    $('#campus-edit-form', root).innerHTML =
      `<form id="campus-place-form"><h3>${esc(place.id ? '编辑校园地点' : '新增校园地点')}</h3><div class="campus-form-grid">${input('name', '地点名称', 'text', 'required maxlength="80"')}${input('aliases', '别名 / 学院名称', 'text', 'maxlength="300"')}${options(
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
      )}${input('lng', '经度（WGS84）', 'number', 'required step="0.0000001"')}${input('lat', '纬度（WGS84）', 'number', 'required step="0.0000001"')}</div><button type="button" id="campus-pick" class="button secondary">地图选位置</button><details class="campus-model-options"><summary>示意建筑外观</summary><div class="campus-form-grid">${input('height', '楼高（米）', 'number', 'required min="1" max="100" step="0.1"')}${input('width', '东西宽度（米）', 'number', 'required min="3" max="180" step="0.1"')}${input('depth', '南北深度（米）', 'number', 'required min="3" max="180" step="0.1"')}${input('rotation', '转角（度）', 'number', 'required min="-180" max="180" step="0.1"')}${options(
        'roof',
        '屋顶',
        [
          ['flat', '平顶'],
          ['gable', '坡屋顶'],
          ['tower', '钟楼式示意'],
        ],
      )}</div><p>这些参数只控制示意模型；未实测时不要填成真实测绘值。</p></details>${input('source', '资料来源 / 校准依据', 'text', 'required maxlength="300"')}<label>地点介绍<textarea name="description" maxlength="1000">${esc(place.description || '')}</textarea></label><div class="campus-confirm"><label><input type="checkbox" name="confirmed" ${place.confirmed ? 'checked' : ''}>我已核对并校准实际位置</label><label><input type="checkbox" name="published" ${place.published ? 'checked' : ''}>发布到用户端校园地点</label></div><p class="form-error" role="alert"></p><div class="button-row"><button type="submit" class="button">保存地点</button><button type="button" class="button secondary" id="campus-model-preview">查看已保存模型</button></div></form>`;
    const form = $('#campus-place-form', root);
    form.oninput = () => {
      dirty = true;
    };
    $('#campus-pick', root).onclick = () => {
      picking = !picking;
      pickTip();
      $('#admin-campus-map', root).scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    $('#campus-model-preview', root).onclick = () => {
      if (dirty) toast('模型预览使用已保存内容，请先保存修改。');
      openCampusScene('/api/admin/campus-map/scene');
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      try {
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
        toast('校园地点已保存');
        await load(response.place.id);
      } catch (error) {
        if (alive()) $('.form-error', form).textContent = error.message;
      } finally {
        if (form.isConnected) button.disabled = false;
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
    const next = await api('/api/admin/campus-map');
    if (!alive()) return;
    data = next;
    map?.destroy();
    map = null;
    $('#campus-category', root).innerHTML =
      '<option value="">全部分类</option>' +
      data.categories.map((t) => `<option>${esc(t)}</option>`).join('');
    filter();
    const nextMap = await campusMap(
      $('#admin-campus-map', root),
      { ...data, points: data.places },
      {
        onPoint: (id) => {
          const p = data.places.find((p) => p.id === id);
          if (p) edit(p);
        },
        canPick: () => picking,
        onPick: (p) => {
          const form = $('#campus-place-form', root);
          if (!form) return false;
          form.elements.lng.value = p.lng.toFixed(7);
          form.elements.lat.value = p.lat.toFixed(7);
          form.elements.confirmed.checked = false;
          form.elements.published.checked = false;
          dirty = true;
          picking = false;
          pickTip();
          return true;
        },
      },
    );
    if (!alive()) {
      nextMap.destroy();
      return;
    }
    map = nextMap;
    filter();
    if (selectId) {
      const p = data.places.find((p) => p.id === selectId);
      if (p) edit(p);
    }
  }
  $('#campus-preview', root).onclick = () => openCampusScene('/api/admin/campus-map/scene');
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
      height: 18,
      width: 36,
      depth: 20,
      roof: 'flat',
      rotation: 0,
      revision: 0,
      confirmed: false,
      published: false,
    });
  };
  ['campus-query', 'campus-zone', 'campus-category'].forEach((id) =>
    $('#' + id, root).addEventListener('input', filter),
  );
  const unload = (e) => {
    if (dirty) {
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
    map?.destroy();
    window.removeEventListener('beforeunload', unload);
  };
}
