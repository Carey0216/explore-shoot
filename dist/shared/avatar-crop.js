import { readPhoto } from './ui.js';

export function cropRect(width, height, zoom = 1, x = width / 2, y = height / 2) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw Error('图片尺寸无效');
  zoom = Math.max(1, Math.min(4, Number(zoom) || 1));
  const size = Math.min(width, height) / zoom;
  x = Math.max(size / 2, Math.min(width - size / 2, Number.isFinite(x) ? x : width / 2));
  y = Math.max(size / 2, Math.min(height - size / 2, Number.isFinite(y) ? y : height / 2));
  return { x, y, size, zoom, sx: x - size / 2, sy: y - size / 2 };
}
export const cropHTML = () =>
  `<section class="avatar-crop" id="avatar-crop" hidden aria-label="头像裁切"><p>拖动图片选择区域，缩放调整大小</p><div class="avatar-crop-window"><canvas width="512" height="512" tabindex="0" aria-label="拖动裁切头像；方向键移动，加减键缩放"></canvas><span class="avatar-crop-guide" aria-hidden="true"></span></div><label class="avatar-crop-zoom">缩放<input type="range" min="1" max="4" step="0.01" value="1" aria-label="头像缩放比例"></label><button class="button secondary small" type="button" data-crop-center>重新居中</button><p class="tip">固定 1:1 比例，当前区域会作为头像保存。键盘方向键可移动，＋ / －可缩放。</p></section>`;

export async function mountAvatarCrop(file, box, onChange) {
  // Normalize orientation and bound decoding size before interactive cropping.
  const photo = await readPhoto(file, { maxSize: 4096 });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error('图片无法读取，请重新选择'));
    img.src = photo;
  });
  const canvas = box.querySelector('canvas'),
    slider = box.querySelector('input'),
    center = box.querySelector('[data-crop-center]'),
    ctx = canvas.getContext('2d');
  if (!ctx) throw Error('当前浏览器无法裁切图片');
  const width = image.naturalWidth,
    height = image.naturalHeight;
  let rect = cropRect(width, height),
    closed = false,
    drag = null;
  const render = () => {
    if (closed) return;
    rect = cropRect(width, height, rect.zoom, rect.x, rect.y);
    ctx.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, 512, 512);
    slider.value = String(rect.zoom);
    onChange(canvas.toDataURL('image/jpeg', 0.86));
  };
  const zoom = (value) => {
    rect.zoom = value;
    render();
  };
  canvas.onpointerdown = (e) => {
    if ((e.button !== undefined && e.button !== 0) || drag) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();
    const display = canvas.getBoundingClientRect().width || 1;
    rect.x -= ((e.clientX - drag.x) * rect.size) / display;
    rect.y -= ((e.clientY - drag.y) * rect.size) / display;
    drag.x = e.clientX;
    drag.y = e.clientY;
    render();
  };
  const release = (e) => {
    if (drag?.id !== e.pointerId) return;
    drag = null;
  };
  canvas.onpointerup = release;
  canvas.onpointercancel = release;
  canvas.onlostpointercapture = release;
  canvas.onkeydown = (e) => {
    const moves = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (moves[e.key]) {
      e.preventDefault();
      const step = rect.size * (e.shiftKey ? 0.1 : 0.025);
      rect.x += moves[e.key][0] * step;
      rect.y += moves[e.key][1] * step;
      render();
    } else if (['+', '=', '-'].includes(e.key)) {
      e.preventDefault();
      zoom(rect.zoom + (e.key === '-' ? -0.1 : 0.1));
    }
  };
  const wheel = (e) => {
    e.preventDefault();
    zoom(rect.zoom + (e.deltaY > 0 ? -0.1 : 0.1));
  };
  canvas.addEventListener('wheel', wheel, { passive: false });
  slider.oninput = () => zoom(Number(slider.value));
  center.onclick = () => {
    rect = cropRect(width, height);
    render();
  };
  box.hidden = false;
  render();
  return {
    destroy() {
      closed = true;
      drag = null;
      canvas.onpointerdown =
        canvas.onpointermove =
        canvas.onpointerup =
        canvas.onpointercancel =
        canvas.onlostpointercapture =
        canvas.onkeydown =
          null;
      canvas.removeEventListener('wheel', wheel);
      slider.oninput = null;
      center.onclick = null;
      box.hidden = true;
    },
  };
}
