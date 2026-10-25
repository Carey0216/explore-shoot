const api = require('./api');
async function preview(sources, current) {
  const list = [...new Set([current, ...sources].filter(Boolean))].slice(0, 30),
    paths = new Map();
  const page = getCurrentPages().slice(-1)[0],
    owner = api.session()?.account.id;
  const alive = () =>
    getCurrentPages().slice(-1)[0] === page && api.session()?.account.id === owner;
  wx.showLoading({ title: '正在打开照片', mask: false });
  try {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, list.length) }, async () => {
        while (next < list.length) {
          const source = list[next++];
          try {
            paths.set(source, await api.download(source, false));
          } catch (e) {
            if (source === current) throw e;
          }
        }
      }),
    );
    if (!alive()) return;
    const urls = sources.filter((s) => paths.has(s)).map((s) => paths.get(s));
    if (!urls.includes(paths.get(current))) urls.unshift(paths.get(current));
    if (urls.length) wx.previewImage({ urls, current: paths.get(current) || urls[0] });
  } catch (e) {
    if (alive()) api.message(e);
  } finally {
    wx.hideLoading();
  }
}
module.exports = { preview };
