const api = require('./api'),
  { configuredOrigin } = require('./network'),
  { qrcodegen } = require('./qrcodegen');

async function miniCode(node, pointId) {
  let timer;
  const load = async () => {
    const path =
      '/api/share/mini-code?' + (pointId ? 'point=' + encodeURIComponent(pointId) : 'entry=campus');
    const file = await api.download(path, false);
    const image = node.createImage();
    return new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = file;
    });
  };
  try {
    return await Promise.race([
      load(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 5500);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function campusShareCodes(node) {
  return {
    qr: qrcodegen.QrCode.encodeText(configuredOrigin() + '/', qrcodegen.QrCode.Ecc.MEDIUM),
    mini: await miniCode(node),
  };
}

module.exports = { miniCode, campusShareCodes };
