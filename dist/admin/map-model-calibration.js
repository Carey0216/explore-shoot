import { $, api, esc, toast } from '/shared/ui.js';
import { formFeedback, validateEditableForm } from './map-selection.js';

export function mapModelCalibrationHTML() {
  return `<details class="map-model-calibration"><summary>地图内建筑模型配准</summary><p>先在上方地图核对钟楼的位置、比例和朝向。模型外观及高度为估算，未发布的预览仅管理端可见。</p><div class="map-model-form-host"><p role="status">展开后载入模型。</p></div></details>`;
}

export function setupMapModelCalibration(root, { getMap, accepts, onBegin }) {
  const panel = $('.map-model-calibration', root),
    host = $('.map-model-form-host', panel);
  let disposed = false,
    selecting = false,
    dirty = false,
    record = null,
    loading = false;
  const alive = () => !disposed && panel.isConnected;
  const fail = (message) => {
    if (!alive()) return;
    const form = $('form', host);
    if (form) formFeedback(form, message, { scroll: false });
    else host.textContent = message;
    toast(message);
  };
  function draw(next) {
    record = next;
    selecting = false;
    dirty = false;
    const input = (name, label, extra = '') =>
      `<label>${label}<input name="${name}" value="${esc(record[name])}" ${extra}></label>`;
    host.innerHTML = `<form novalidate class="map-model-form"><div class="campus-form-grid">${input('lng', '经度（WGS84）', 'type="number" step="any" required')}${input('lat', '纬度（WGS84）', 'type="number" step="any" required')}${input('heading', '旋转（顺时针°）', 'type="number" min="-360" max="360" step="1" required')}${input('scale', '尺寸比例', 'type="number" min="0.1" max="2" step="0.01" required')}${input('altitude', '地面高度偏移（米）', 'type="number" min="-20" max="30" step="0.1" required')}${input('source', '位置核对依据', 'type="text" maxlength="300" required')}</div><p class="map-model-size" role="status"></p><div class="button-row"><button type="button" class="button secondary" data-model-pick>在地图上选模型位置</button><button type="button" class="button secondary" data-model-confirm hidden aria-label="确认模型选点">√</button><button type="button" class="button secondary" data-model-preview>地图预览</button></div><label class="map-model-verified"><input type="checkbox" name="confirmed" ${record.confirmed ? 'checked' : ''}>已核对位置、比例和朝向</label><p class="form-error" role="alert"></p><div class="button-row"><button type="submit" class="button secondary">保存草稿</button><button type="submit" class="button" data-publish="true">发布到用户地图</button><button type="button" class="button secondary" data-model-unpublish>从用户地图下架</button></div></form>`;
    const form = $('form', host),
      confirm = $('[data-model-confirm]', form);
    function size() {
      const scale = Number(form.elements.scale.value);
      $('.map-model-size', form).textContent = Number.isFinite(scale)
        ? `估算尺寸：宽 ${(86.07 * scale).toFixed(1)} 米，高 ${(80 * scale).toFixed(1)} 米`
        : '';
    }
    form.oninput = (e) => {
      dirty = true;
      if (['lng', 'lat', 'heading', 'scale', 'altitude'].includes(e.target.name))
        form.elements.confirmed.checked = false;
      size();
    };
    $('[data-model-pick]', form).onclick = () => {
      const map = getMap();
      if (!map) return fail('地图正在载入，请稍后再预览');
      if (!map?.previewModel) return fail('当前地图不支持模型预览，请使用腾讯地图');
      onBegin();
      $('#admin-campus-map', root)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      selecting = true;
      confirm.hidden = false;
      form.elements.confirmed.checked = false;
      formFeedback(form, '连续点击上方地图调整模型位置，点 √ 锁定后再预览。', {
        error: false,
        scroll: false,
      });
    };
    confirm.onclick = () => {
      selecting = false;
      confirm.hidden = true;
      formFeedback(form, '模型选点已锁定，点击“地图预览”核对尺寸和朝向。', {
        error: false,
        scroll: false,
      });
    };
    $('[data-model-preview]', form).onclick = async () => {
      try {
        if (selecting) throw Error('请先点 √ 锁定模型位置');
        validateEditableForm(form);
        const p = value(form);
        if (!accepts(p)) throw Error('请选择校园内的模型位置');
        const map = getMap();
        if (!map) throw Error('地图正在载入，请稍后再预览');
        if (!map?.previewModel) throw Error('当前地图不支持模型预览，请使用腾讯地图');
        const result = await map.previewModel({
          ...p,
          id: 'clock',
          modelUrl: record.modelUrl,
        });
        $('#admin-campus-map', root)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (!alive() || !result) return;
        if (!result.loaded) throw Error('模型加载失败，地图与地点仍可正常使用');
        formFeedback(form, '预览已载入；从不同方向观察后再勾选核对并发布。', {
          error: false,
          scroll: false,
        });
      } catch (e) {
        fail(e.message);
      }
    };
    const busy = (value) => form.querySelectorAll('button').forEach((b) => (b.disabled = value));
    form.onsubmit = async (e) => {
      e.preventDefault();
      busy(true);
      try {
        if (selecting) throw Error('请先点 √ 锁定模型位置');
        validateEditableForm(form);
        const p = value(form);
        p.published = !!e.submitter?.dataset.publish;
        if (p.published && !p.confirmed) throw Error('请先核对模型位置、比例和朝向，再发布');
        const response = await api('/api/admin/campus-map/map-models/clock', 'PATCH', p);
        if (!alive()) return;
        draw(response.model);
        toast(p.published ? '模型已发布到用户地图' : '模型草稿已保存，已发布版本保持不变');
      } catch (e) {
        fail(e.message);
      } finally {
        if (form.isConnected) busy(false);
      }
    };
    $('[data-model-unpublish]', form).onclick = async () => {
      busy(true);
      try {
        const response = await api('/api/admin/campus-map/map-models/clock/unpublish', 'POST', {
          revision: record.revision,
        });
        if (alive()) {
          draw(response.model);
          toast('模型已下架，用户地图保留底图');
        }
      } catch (e) {
        fail(e.message);
      } finally {
        if (form.isConnected) busy(false);
      }
    };
    size();
  }
  function value(form) {
    const p = {
      revision: record.revision,
      confirmed: form.elements.confirmed.checked,
      source: form.elements.source.value,
    };
    for (const key of ['lng', 'lat', 'heading', 'scale', 'altitude'])
      p[key] = Number(form.elements[key].value);
    return p;
  }
  panel.addEventListener('toggle', async () => {
    if (!panel.open) {
      selecting = false;
      const button = $('[data-model-confirm]', panel);
      if (button) button.hidden = true;
      return;
    }
    if (record || loading) return;
    loading = true;
    try {
      const response = await api('/api/admin/campus-map/map-models');
      if (alive()) draw(response.models[0]);
    } catch (e) {
      fail(e.message);
    } finally {
      loading = false;
    }
  });
  return {
    get selecting() {
      return selecting;
    },
    get dirty() {
      return dirty;
    },
    stopPicking() {
      selecting = false;
      const b = $('[data-model-confirm]', panel);
      if (b) b.hidden = true;
    },
    pick(p) {
      if (!selecting || !alive()) return;
      if (!accepts(p)) return fail('请选择校园内的模型位置');
      const form = $('form', host);
      form.elements.lng.value = p.lng.toFixed(7);
      form.elements.lat.value = p.lat.toFixed(7);
      form.elements.confirmed.checked = false;
      dirty = true;
      getMap()?.pick?.(p);
    },
    destroy() {
      disposed = true;
      selecting = false;
    },
  };
}
