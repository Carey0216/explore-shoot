import '/shared/album-export-core.js';
const core = globalThis.JingyuAlbumExport;
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error('照片加载失败，请检查网络后重试'));
    image.src = path;
  });
}
export async function renderMemoryCanvas(
  album,
  items,
  { page = 0, alive = () => true, progress = () => {} } = {},
) {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d');
  const plan = core.layout(context, album, items, page);
  if (plan.width * plan.height > 5000000) throw Error('留言较长，请先导出PDF分册');
  canvas.width = plan.width;
  canvas.height = plan.height;
  core.base(context, plan);
  for (let index = 0; index < plan.cells.length; index++) {
    if (!alive()) {
      canvas.width = 1;
      canvas.height = 1;
      throw Error('账号或页面已改变，导出已停止');
    }
    const cell = plan.cells[index];
    if (!cell.item.available) throw Error('有照片已删除，请先编辑回忆册');
    const image = await loadImage(cell.item.photo);
    if (!alive()) {
      image.src = '';
      throw Error('账号已改变，导出已停止');
    }
    core.photo(context, cell, image);
    image.src = '';
    progress(index + 1, items.length);
  }
  return canvas;
}
const jpeg = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error('导出失败，请改用PDF'))),
      'image/jpeg',
      0.93,
    ),
  );
export async function exportMemory(
  album,
  format,
  { alive = () => true, progress = () => {} } = {},
) {
  const items = album.items.filter((item) => item.available);
  if (items.length !== album.items.length) throw Error('有照片已删除，请先编辑回忆册再导出');
  if (!items.length) throw Error('请先选择照片');
  if (format === 'image') {
    const canvas = await renderMemoryCanvas(album, items, { alive, progress });
    const blob = await jpeg(canvas);
    canvas.width = 1;
    canvas.height = 1;
    return blob;
  }
  const pages = [];
  for (let start = 0; start < items.length; start += 4) {
    const canvas = await renderMemoryCanvas(album, items.slice(start, start + 4), {
      page: start / 4,
      alive,
      progress: (index) => progress(start + index, items.length),
    });
    const blob = await jpeg(canvas);
    pages.push({
      width: canvas.width,
      height: canvas.height,
      jpeg: new Uint8Array(await blob.arrayBuffer()),
    });
    canvas.width = 1;
    canvas.height = 1;
  }
  return new Blob([core.pdf(pages)], { type: 'application/pdf' });
}
export function saveMemoryFile(blob, title, format) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download =
    String(title || '校园回忆册').replace(/[\\/:*?"<>|]/g, '-') +
    (format === 'image' ? '.jpg' : '.pdf');
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
