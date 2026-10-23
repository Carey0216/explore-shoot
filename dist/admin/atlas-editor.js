import { esc } from '/shared/ui.js';

// Geometry stays in source-image pixels. SVG's inverse transform also handles the rotated overhead.
export function mountAtlasEditor(root, atlas, building) {
  const photo = building.frame === 'photo',
    width = photo ? atlas.photoWidth : atlas.planWidth,
    height = photo ? atlas.photoHeight : atlas.planHeight;
  const initial = {
    outline: structuredClone(building.outline),
    holes: structuredClone(building.holes || []),
  };
  let shape = structuredClone(initial),
    active = 0,
    drawing = false,
    drag = null,
    history = [];
  const full = photo ? [0, 0, height, width] : [85, 112, 1120, 466];
  let box = [...full];
  root.innerHTML = `<div class="atlas-editor-tools"><button type="button" data-action="pan">拖动底图</button><button type="button" data-action="redraw">重画外轮廓</button><button type="button" data-action="hole">新增内院</button><button type="button" data-action="undo">撤销</button><button type="button" data-action="finish">结束圈画</button><button type="button" data-action="in" aria-label="放大">＋</button><button type="button" data-action="out" aria-label="缩小">−</button><button type="button" data-action="reset">还原本次修改</button></div><p class="muted" role="status">拖动顶点调整边线；放大后可拖动底图。重画时依次点击楼宇边缘，至少三个点。</p><svg class="atlas-edit-canvas" role="application" aria-label="楼宇轮廓编辑底图"><g ${photo ? `transform="translate(0,${width}) rotate(-90)"` : ''}><image href="${esc(photo ? atlas.photoURL : atlas.planURL)}" width="${width}" height="${height}"/><g class="atlas-edit-shape"></g></g></svg>`;
  const svg = root.querySelector('svg'),
    plane = svg.firstElementChild,
    layer = root.querySelector('.atlas-edit-shape');
  const rings = () => [shape.outline, ...shape.holes];
  const snapshot = () => {
    history.push({ shape: structuredClone(shape), active, drawing });
    if (history.length > 40) history.shift();
  };
  function render() {
    svg.setAttribute('viewBox', box.join(' '));
    const scale = box[2] / Math.max(svg.clientWidth, 1);
    layer.innerHTML = rings()
      .map(
        (ring, i) =>
          `<polygon points="${ring.map((p) => p.join(',')).join(' ')}" fill="${i ? '#fbf8ed' : '#4c9feb'}" fill-opacity=".25" stroke="${i === active ? '#ee4c83' : '#eef7ff'}" stroke-width="2" vector-effect="non-scaling-stroke"/>${ring.map((p, j) => `<circle data-ring="${i}" data-index="${j}" cx="${p[0]}" cy="${p[1]}" r="${5 * scale}" fill="#fff" stroke="#db3d72" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}`,
      )
      .join('');
    root.querySelector('[role=status]').textContent = drawing
      ? `正在圈画${active ? '内院' : '外轮廓'} · ${rings()[active].length} 个顶点，完成后点击「结束圈画」`
      : '拖动顶点调整；拖动空白处平移底图。保存后双端同步。';
  }
  const position = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(plane.getScreenCTM().inverse());
    return [
      Math.max(0, Math.min(width, Math.round(p.x * 100) / 100)),
      Math.max(0, Math.min(height, Math.round(p.y * 100) / 100)),
    ];
  };
  svg.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    const vertex = e.target.closest('circle');
    if (vertex) {
      snapshot();
      drag = { vertex: [Number(vertex.dataset.ring), Number(vertex.dataset.index)] };
    } else if (drawing) {
      snapshot();
      rings()[active].push(position(e));
      render();
    } else drag = { x: e.clientX, y: e.clientY, box: [...box] };
  };
  svg.onpointermove = (e) => {
    if (!drag) return;
    if (drag.vertex) {
      const [r, i] = drag.vertex;
      rings()[r][i] = position(e);
    } else {
      const scale = box[2] / svg.clientWidth;
      box[0] = drag.box[0] - (e.clientX - drag.x) * scale;
      box[1] = drag.box[1] - (e.clientY - drag.y) * scale;
    }
    render();
  };
  svg.onpointerup = svg.onpointercancel = () => {
    drag = null;
  };
  root.querySelectorAll('[data-action]').forEach(
    (button) =>
      (button.onclick = () => {
        const action = button.dataset.action;
        if (action === 'undo') {
          if (history.length) ({ shape, active, drawing } = history.pop());
        } else if (action === 'reset') {
          snapshot();
          shape = structuredClone(initial);
          active = 0;
          drawing = false;
        } else if (action === 'redraw') {
          snapshot();
          shape = { outline: [], holes: [] };
          active = 0;
          drawing = true;
        } else if (action === 'hole') {
          snapshot();
          shape.holes.push([]);
          active = shape.holes.length;
          drawing = true;
        } else if (action === 'pan' || action === 'finish') drawing = false;
        else {
          const factor = action === 'in' ? 0.65 : 1 / 0.65;
          if (box[2] * factor > full[2] * 1.5 || box[2] * factor < full[2] / 32) return;
          box = [
            box[0] + (box[2] * (1 - factor)) / 2,
            box[1] + (box[3] * (1 - factor)) / 2,
            box[2] * factor,
            box[3] * factor,
          ];
        }
        render();
      }),
  );
  // Open close to the selected building; small roofs remain editable on phones.
  const points = building.outline.map(([x, y]) => (photo ? [y, width - x] : [x, y]));
  const x = Math.min(...points.map((p) => p[0])),
    y = Math.min(...points.map((p) => p[1]));
  const spanX = Math.max(...points.map((p) => p[0])) - x,
    spanY = Math.max(...points.map((p) => p[1])) - y,
    aspect = svg.clientHeight / Math.max(1, svg.clientWidth),
    w = Math.max(160, spanX + 80, (spanY + 80) / aspect),
    h = w * aspect;
  box = [x + spanX / 2 - w / 2, y + spanY / 2 - h / 2, w, h];
  render();
  return {
    value() {
      if (rings().some((r) => r.length < 3))
        throw Error('每个轮廓至少需要三个顶点，请完成圈画或撤销内院');
      return structuredClone(shape);
    },
  };
}
