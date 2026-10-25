const core = require('./album-export-core'),
  api = require('./api');
const fileSystem = () => wx.getFileSystemManager();
function node(page) {
  return new Promise((resolve, reject) =>
    page
      .createSelectorQuery()
      .select('#memory-export-canvas')
      .fields({ node: true, size: true })
      .exec((rows) =>
        rows?.[0]?.node ? resolve(rows[0].node) : reject(Error('导出画布尚未准备好，请重试')),
      ),
  );
}
function image(canvas, file) {
  return new Promise((resolve, reject) => {
    const value = canvas.createImage();
    value.onload = () => resolve(value);
    value.onerror = () => reject(Error('照片未载入，请检查网络后重试'));
    value.src = file;
  });
}
function jpeg(canvas) {
  return new Promise((resolve, reject) =>
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'jpg',
      quality: 0.93,
      success: (r) => {
        api.registerFile(r.tempFilePath);
        resolve(r.tempFilePath);
      },
      fail: () => reject(Error('图片导出失败，请尝试PDF')),
    }),
  );
}
async function render(canvas, album, items, page, alive, progress) {
  let context = canvas.getContext('2d'),
    plan = core.layout(context, album, items, page);
  if (plan.width * plan.height > 5000000) throw Error('留言较长，请改用PDF分册');
  canvas.width = plan.width;
  canvas.height = plan.height;
  context = canvas.getContext('2d');
  core.base(context, plan);
  for (let i = 0; i < plan.cells.length; i++) {
    if (!alive()) throw Error('账号或页面已改变，导出已停止');
    const cell = plan.cells[i];
    if (!cell.item.available) throw Error('有照片已删除，请先编辑回忆册');
    const file = await api.download(cell.item.photo, false);
    if (!alive()) throw Error('账号已改变，导出已停止');
    const photo = await image(canvas, file);
    if (!alive()) throw Error('账号已改变，导出已停止');
    core.photo(context, cell, photo);
    photo.src = '';
    progress(i + 1, items.length);
  }
  if (!alive()) throw Error('页面已改变');
  return { file: await jpeg(canvas), width: plan.width, height: plan.height };
}
async function exportAlbum(page, album, format, progress) {
  const identity = api.identity(),
    alive = () => page.nativeVisible && api.identity() === identity;
  if (album.items.some((i) => !i.available)) throw Error('有照片已删除，请编辑后再导出');
  const canvas = await node(page),
    pages = [],
    temporary = [];
  try {
    if (format === 'image') {
      const out = await render(canvas, album, album.items, 0, alive, progress);
      if (!alive()) {
        api.forgetFile(out.file);
        throw Error('账号已改变');
      }
      wx.previewImage({ current: out.file, urls: [out.file] });
      return;
    }
    for (let start = 0; start < album.items.length; start += 4) {
      const out = await render(
        canvas,
        album,
        album.items.slice(start, start + 4),
        start / 4,
        alive,
        (done) => progress(start + done, album.items.length),
      );
      temporary.push(out.file);
      pages.push({
        width: out.width,
        height: out.height,
        jpeg: new Uint8Array(fileSystem().readFileSync(out.file)),
      });
    }
    if (!alive()) throw Error('账号已改变');
    const bytes = core.pdf(pages),
      file = wx.env.USER_DATA_PATH + '/JINGYU-Memories-' + Date.now() + '.pdf';
    await new Promise((resolve, reject) =>
      fileSystem().writeFile({
        filePath: file,
        data: bytes.buffer,
        success: resolve,
        fail: reject,
      }),
    );
    api.registerFile(file);
    if (!alive()) {
      api.forgetFile(file);
      throw Error('账号已改变');
    }
    await new Promise((resolve, reject) =>
      wx.openDocument({
        filePath: file,
        fileType: 'pdf',
        showMenu: true,
        success: resolve,
        fail: reject,
      }),
    );
  } finally {
    temporary.forEach((file) => api.forgetFile(file));
    canvas.width = 1;
    canvas.height = 1;
  }
}
module.exports = { exportAlbum };
