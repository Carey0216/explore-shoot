import { $, esc, modal, toast } from '/shared/ui.js';
// Approximate composition guide. Camera/compass are opt-in, never a navigation measurement.
export function openFraming(spot) {
  let stream = null,
    stopped = false;
  const heading = (e) => {
    const angle = Number.isFinite(e.webkitCompassHeading)
      ? e.webkitCompassHeading
      : Number.isFinite(e.alpha)
        ? (360 - e.alpha) % 360
        : null;
    if (angle !== null && !stopped) {
      const el = $('#framing-current');
      if (el) el.textContent = `设备参考朝向 ${Math.round(angle)}°（请现场校准）`;
    }
  };
  const stop = () => {
    stopped = true;
    const button = $('#framing-start');
    if (button) {
      button.disabled = false;
      button.textContent = '重新开启相机';
    }
    stream?.getTracks().forEach((t) => t.stop());
    window.removeEventListener('deviceorientation', heading);
    window.removeEventListener('viewport:mode', viewport);
    document.removeEventListener('visibilitychange', hidden);
  };
  const viewport = (e) => {
    if (e.detail.blocked) stop();
  };
  const hidden = () => {
    if (document.hidden) stop();
  };
  modal(
    '站位取景辅助',
    `<p>${esc(spot.standDescription)}</p><p>朝向 <strong>${Number(spot.bearing)}°</strong> · ${spot.heightMeters ? `建议镜头距地 ${Number(spot.heightMeters)} 米` : '建议高度待维护'}</p><p class="muted">${esc(spot.heightAdvice || '根据现场和自身身高校准构图；不作为精密测量。')}</p><div class="framing-stage"><video id="framing-video" autoplay muted playsinline></video>${spot.photo ? `<img id="framing-example" src="${esc(spot.photo)}" alt="构图参考叠图">` : '<span>暂无示例照片，可使用朝向参考</span>'}<div class="framing-grid" aria-hidden="true"></div></div><label>参考图透明度<input id="framing-opacity" type="range" min="0" max="100" value="40"></label><div class="button-row"><button class="button" id="framing-start">开启相机</button><button class="button secondary" id="framing-compass">开启朝向参考</button></div><p id="framing-current" class="muted" role="status">正北为0°，照片不会自动拍摄或上传。</p>`,
    (d) => {
      d.addEventListener('close', stop, { once: true });
      document.addEventListener('visibilitychange', hidden);
      window.addEventListener('viewport:mode', viewport);
      $('#framing-opacity', d).oninput = (e) => {
        const img = $('#framing-example', d);
        if (img) img.style.opacity = Number(e.target.value) / 100;
      };
      $('#framing-start', d).onclick = async (e) => {
        e.target.disabled = true;
        try {
          if (!navigator.mediaDevices?.getUserMedia)
            throw Error('当前浏览器无法使用相机，请使用HTTPS或本机预览');
          stopped = false;
          const next = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          if (!d.open || stopped) {
            next.getTracks().forEach((t) => t.stop());
            return;
          }
          stream?.getTracks().forEach((t) => t.stop());
          stream = next;
          $('#framing-video', d).srcObject = stream;
          await $('#framing-video', d).play();
          e.target.textContent = '相机已开启';
        } catch (error) {
          toast(error.message);
          e.target.disabled = false;
        }
      };
      $('#framing-compass', d).onclick = async () => {
        try {
          if (typeof DeviceOrientationEvent === 'undefined')
            throw Error('当前设备不提供朝向传感器');
          if (
            DeviceOrientationEvent.requestPermission &&
            (await DeviceOrientationEvent.requestPermission()) !== 'granted'
          )
            throw Error('未允许朝向传感器');
          if (!d.open || document.hidden) return;
          stopped = false;
          window.addEventListener('deviceorientation', heading);
        } catch (e) {
          toast(e.message);
        }
      };
      return stop;
    },
  );
  return stop;
}
