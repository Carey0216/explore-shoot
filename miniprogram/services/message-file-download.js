async function open(file, administrator = false) {
  if (!/^\/api\/messages\/files\/[a-f0-9-]{36}$/.test(file?.url || ''))
    throw Error('文件地址不可用');
  const api = require(administrator ? './admin-api' : './api'),
    token = api.session()?.token;
  const path = await api.download(file.url, false);
  if (!token || api.session()?.token !== token) throw Error('账号已改变，请重新打开文件');
  const ext = String(file.name || '')
    .split('.')
    .pop()
    .toLowerCase();
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    await new Promise((resolve, reject) =>
      wx.openDocument({
        filePath: path,
        fileType: ext,
        showMenu: true,
        success: resolve,
        fail: reject,
      }),
    );
    return;
  }
  const action = await new Promise((resolve, reject) =>
    wx.showActionSheet({
      itemList: ['转发文件'],
      success: resolve,
      fail: reject,
    }),
  );
  if (action.tapIndex === 0 && api.session()?.token === token)
    await new Promise((resolve, reject) =>
      wx.shareFileMessage({ filePath: path, fileName: file.name, success: resolve, fail: reject }),
    );
}
module.exports = { open };
