import { $, api } from '/shared/ui.js';

const pointText = (point) => point.map((value) => Number(value.toFixed(7))).join(', ');
const ringText = (ring) => {
  const points = ring.map(pointText);
  if (points[0] === points.at(-1)) points.pop();
  return points.join('\n');
};

function parseRings(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((ring) =>
      ring.split(/\n/).map((line) => {
        const parts = line.trim().split(/[,，\s]+/);
        const point = parts.map(Number);
        if (parts.length !== 2 || !parts.every(Boolean) || !point.every(Number.isFinite))
          throw Error('每行填写一个经度、纬度坐标。');
        return point;
      }),
    );
}

function centerOf(points) {
  const midpoint = (axis) => {
    const values = points.map((point) => point[axis]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  };
  return [midpoint(0), midpoint(1)];
}

export function buildingEditor(panel, getMap, onSave) {
  const form = document.createElement('form');
  form.className = 'campus-form-grid building-edit-form';
  form.hidden = true;
  form.innerHTML = `<h3>编辑地图三维楼栋</h3>
    <label>楼栋名称<input name="name" required maxlength="80"></label>
    <label>高度（米）<input name="height" type="number" min="1" max="120" step="0.1" required></label>
    <label>屋顶颜色<input name="color" type="color"></label>
    <label>公开显示<select name="status">
      <option value="unreviewed">保存为待核对</option>
      <option value="native">保留腾讯原有建筑</option>
      <option value="missing">启用补绘并同步双端</option>
    </select></label>
    <label>外轮廓<textarea name="footprint" rows="5" required placeholder="每行一个 WGS84 经度、纬度"></textarea></label>
    <label>内院轮廓<textarea name="holes" rows="3" placeholder="每行一个坐标，多个内院之间空一行"></textarea></label>
    <div class="button-row">
      <button type="button" class="button secondary" data-pick="footprint">地图重画外轮廓</button>
      <button type="button" class="button secondary" data-pick="holes">在地图上画内院</button>
      <button type="button" class="button secondary" data-pick="move">在地图上移动楼栋</button>
      <button type="button" class="button secondary" data-finish hidden>结束选点</button>
    </div>
    <details><summary>精调长宽与中心位置</summary>
      <div class="campus-form-grid">
        <label>东西向比例（%）<input name="scaleEast" type="number" value="100" min="10" max="500" step="0.1"></label>
        <label>南北向比例（%）<input name="scaleNorth" type="number" value="100" min="10" max="500" step="0.1"></label>
        <label>顺时针旋转（°）<input name="rotation" type="number" value="0" min="-360" max="360" step="0.1"></label>
        <label>中心经度<input name="longitude" type="number" step="0.0000001"></label>
        <label>中心纬度<input name="latitude" type="number" step="0.0000001"></label>
        <button type="button" class="button secondary" data-transform>应用长宽与位置</button>
      </div>
    </details>
    <div class="button-row">
      <button type="button" class="button secondary" data-building-preview>预览三维效果</button>
      <button type="submit" class="button">保存楼栋</button>
      <button type="button" class="button secondary" data-cancel>关闭编辑</button>
    </div>
    <p role="status"></p>`;
  panel.append(form);
  const input = form.elements;
  const feedback = $('[role="status"]', form);
  const finish = $('[data-finish]', form);
  const submit = $('button[type="submit"]', form);
  let record = null,
    picking = '',
    freshHole = false,
    saving = false;
  const readShape = () => {
    const outer = parseRings(input.footprint.value);
    if (outer.length !== 1 || outer[0].length < 3) throw Error('请先画出至少三个外轮廓顶点。');
    const holes = parseRings(input.holes.value);
    if (holes.some((ring) => ring.length < 3)) throw Error('每个内院至少需要三个顶点。');
    return { footprint: outer[0], holes };
  };
  const setCenter = (points) => {
    const [longitude, latitude] = centerOf(points);
    input.longitude.value = longitude.toFixed(7);
    input.latitude.value = latitude.toFixed(7);
  };
  const preview = async (moveCamera = true) => {
    const shape = readShape();
    const [lng, lat] = centerOf(shape.footprint);
    const map = getMap();
    if (!map?.inspectBuilding) throw Error('请等待腾讯地图加载。');
    await map.inspectBuilding(
      {
        id: record.id || 'building-draft',
        ...shape,
        footprint: [...shape.footprint, shape.footprint[0]],
        holes: shape.holes.map((ring) => [...ring, ring[0]]),
        center: { lng, lat },
        height: Number(input.height.value),
        color: input.color.value,
      },
      true,
      moveCamera,
    );
  };
  const report = (error) => {
    feedback.textContent = error.message;
  };
  const stopPicking = () => {
    picking = '';
    finish.hidden = true;
  };
  const transform = (destination, scaleEast = 1, scaleNorth = 1, rotation = 0) => {
    const shape = readShape();
    const [lng, lat] = centerOf(shape.footprint);
    const ratio = Math.cos((lat * Math.PI) / 180);
    const angle = (rotation * Math.PI) / 180;
    const sin = Math.sin(angle),
      cos = Math.cos(angle);
    const resize = (ring) =>
      ring.map(([x, y]) => {
        const east = (x - lng) * ratio * scaleEast;
        const north = (y - lat) * scaleNorth;
        return [
          destination[0] + (east * cos + north * sin) / ratio,
          destination[1] - east * sin + north * cos,
        ];
      });
    const outer = resize(shape.footprint);
    input.footprint.value = ringText(outer);
    input.holes.value = shape.holes.map((ring) => ringText(resize(ring))).join('\n\n');
    setCenter(outer);
    input.scaleEast.value = input.scaleNorth.value = '100';
    input.rotation.value = '0';
  };
  const close = () => {
    stopPicking();
    form.hidden = true;
    record = null;
  };
  $('[data-cancel]', form).onclick = () => {
    if (!saving) {
      close();
      void getMap()?.inspectBuilding?.(null)?.catch(report);
    }
  };
  for (const button of form.querySelectorAll('[data-pick]')) {
    button.onclick = () => {
      if (!getMap()?.inspectBuilding) return report(Error('请等待腾讯地图加载。'));
      picking = button.dataset.pick;
      if (picking === 'footprint') input.footprint.value = '';
      freshHole = picking === 'holes';
      finish.hidden = false;
      feedback.textContent =
        picking === 'move'
          ? '点击地图指定楼栋的新中心。'
          : '依次点击地图添加顶点，画完后点「结束选点」。';
      $('#admin-campus-map', panel.closest('.campus-editor'))?.scrollIntoView({ block: 'center' });
    };
  }
  finish.onclick = () => {
    stopPicking();
    void preview(false).catch(report);
  };
  $('[data-transform]', form).onclick = () => {
    try {
      const destination = [input.longitude.valueAsNumber, input.latitude.valueAsNumber];
      if (
        !destination.every(Number.isFinite) ||
        !input.scaleEast.checkValidity() ||
        !input.scaleNorth.checkValidity() ||
        !input.scaleEast.value ||
        !input.scaleNorth.value ||
        !input.rotation.checkValidity()
      )
        throw Error('请检查中心经纬度、长宽比例和旋转角度。');
      transform(
        destination,
        Number(input.scaleEast.value) / 100,
        Number(input.scaleNorth.value) / 100,
        Number(input.rotation.value),
      );
      void preview().catch(report);
    } catch (error) {
      report(error);
    }
  };
  $('[data-building-preview]', form).onclick = () => void preview().catch(report);
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!record || saving) return;
    const edited = record;
    stopPicking();
    saving = submit.disabled = true;
    try {
      const saved = await api('/api/admin/campus-map/buildings', edited.id ? 'PUT' : 'POST', {
        ...(edited.id ? { id: edited.id } : {}),
        revision: edited.revision,
        name: input.name.value.trim(),
        height: Number(input.height.value),
        color: input.color.value,
        status: input.status.value,
        ...readShape(),
      });
      if (record !== edited || !panel.isConnected) return;
      close();
      onSave(saved);
    } catch (error) {
      if (record === edited) report(error);
    } finally {
      saving = submit.disabled = false;
    }
  };
  return {
    open(building) {
      if (saving) return;
      stopPicking();
      record = building || { revision: 0 };
      form.reset();
      input.name.value = building?.name || '';
      input.height.value = building?.height || 18;
      input.color.value = building?.color || '#bac4d1';
      input.status.value = building?.coverage || 'unreviewed';
      input.footprint.value = building ? ringText(building.footprint) : '';
      input.holes.value = (building?.holes || []).map(ringText).join('\n\n');
      if (building) setCenter(building.footprint);
      feedback.textContent = '';
      form.hidden = false;
      input.name.focus();
    },
    close,
    picking: () => Boolean(picking) && !form.hidden,
    pick({ lng, lat }) {
      try {
        if (picking === 'move') {
          transform([lng, lat]);
          stopPicking();
        } else {
          const field = input[picking];
          if (field.value) field.value += freshHole ? '\n\n' : '\n';
          field.value += pointText([lng, lat]);
          freshHole = false;
          const [outer] = parseRings(input.footprint.value);
          if (outer?.length) setCenter(outer);
        }
        void preview(false).catch(() => {});
      } catch (error) {
        report(error);
      }
      return false;
    },
  };
}
