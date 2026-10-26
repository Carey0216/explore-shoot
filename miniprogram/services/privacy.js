// Called only from an explicit camera/photo/location action; never at startup.
async function authorize() {
  if (typeof wx.requirePrivacyAuthorize !== 'function') return;
  await new Promise((resolve, reject) =>
    wx.requirePrivacyAuthorize({
      success: resolve,
      fail: () =>
        reject(Error('尚未同意微信隐私保护指引。内容已保留，请重新点击并阅读授权说明后继续。')),
    }),
  );
}
module.exports = { authorize };
