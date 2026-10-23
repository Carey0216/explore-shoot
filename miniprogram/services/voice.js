// Speech bytes are short lived and belong to the current account/backend epoch.
function audio(text, voice = 'he') {
  const api = require('./api'),
    owner = api.session()?.account.id,
    origin = require('./network').backendOrigin();
  return new Promise((resolve, reject) =>
    wx.request({
      url: origin + '/api/mini/navigation/speech',
      method: 'POST',
      data: { text: String(text).slice(0, 120), voice, prefetch: false },
      header: { 'content-type': 'application/json', ...api.headers() },
      responseType: 'arraybuffer',
      timeout: 90000,
      success: (r) => {
        if (owner !== api.session()?.account.id || origin !== require('./network').backendOrigin())
          return reject(Error('账号或后端已改变'));
        if (r.statusCode !== 200 || r.data.byteLength > 2000000)
          return reject(Error('语音暂不可用，可继续查看文字路线'));
        const file = wx.env.USER_DATA_PATH + '/navigation-' + Date.now() + '.wav';
        wx.getFileSystemManager().writeFile({
          filePath: file,
          data: r.data,
          success: () => resolve(file),
          fail: reject,
        });
      },
      fail: reject,
    }),
  );
}
function play(file) {
  const ctx = wx.createInnerAudioContext();
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    ctx.stop();
    ctx.destroy();
    wx.getFileSystemManager().unlink({ filePath: file, fail() {} });
  };
  ctx.src = file;
  ctx.onEnded(stop);
  ctx.onError(stop);
  ctx.play();
  return stop;
}
module.exports = { audio, play };
