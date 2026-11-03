// Resize events carry the current dimensions even when a runtime caches getWindowInfo.
let installed = false;
let resized = null;

function update(event) {
  const size = event?.size;
  if (size?.windowWidth > 0 && size?.windowHeight > 0) resized = { ...size };
}

function install() {
  if (installed) return;
  installed = true;
  wx.onWindowResize?.(update);
}

function snapshot() {
  install();
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  return resized ? { ...info, ...resized } : info;
}

module.exports = { install, update, snapshot };
