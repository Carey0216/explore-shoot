function choose() {
  return new Promise((resolve, reject) =>
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success(result) {
        resolve(result.tempFiles[0].tempFilePath);
      },
      fail(error) {
        reject(error);
      },
    }),
  );
}
function compress(path, canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas) return reject(Error('照片压缩失败，请换一张照片'));
    const image = canvas.createImage();
    image.onerror = () => reject(Error('照片压缩失败，请换一张照片'));
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // Explicit JPEG export also accepts PNG screenshots without lying about their MIME type.
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'jpg',
        quality: 0.82,
        success(result) {
          resolve(result.tempFilePath);
        },
        fail() {
          reject(Error('照片压缩失败，请换一张照片'));
        },
      });
    };
    image.src = path;
  });
}
function dataURL(path) {
  return new Promise((resolve, reject) =>
    wx.getFileSystemManager().getFileInfo({
      filePath: path,
      success(info) {
        if (info.size > 5 * 1024 * 1024)
          return reject(Error('压缩后照片仍超过 5MB，请换一张较小照片'));
        wx.getFileSystemManager().readFile({
          filePath: path,
          encoding: 'base64',
          success(result) {
            resolve('data:image/jpeg;base64,' + result.data);
          },
          fail() {
            reject(Error('无法读取照片'));
          },
        });
      },
      fail() {
        reject(Error('照片已失效，请重新选择'));
      },
    }),
  );
}
module.exports = { choose, compress, dataURL };
