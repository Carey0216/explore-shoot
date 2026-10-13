import { api, esc, modal } from './ui.js';

// These angles describe the supplied cube faces, not a surveyed compass heading.
export const panoramaViews = [
  { label: '主楼', yaw: 180, pitch: -25 },
  { label: '图书馆', yaw: 270, pitch: -30 },
  { label: '体育场与明湖', yaw: 0, pitch: -30 },
  { label: '体育馆与北侧楼群', yaw: 90, pitch: -25 },
];
export function panoramaCamera(initial = panoramaViews[0]) {
  let yaw = initial.yaw,
    pitch = initial.pitch,
    fov = 75;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  return {
    read: () => ({ yaw, pitch, fov }),
    turn(dx, dy) {
      yaw = (((yaw + dx) % 360) + 360) % 360;
      pitch = clamp(pitch + dy, -85, 85);
    },
    zoom(delta) {
      fov = clamp(fov + delta, 35, 100);
    },
    select(view) {
      yaw = view.yaw;
      pitch = view.pitch;
      fov = 75;
    },
  };
}

export function panoramaFaces(data) {
  const order = ['l', 'r', 'u', 'd', 'b', 'f'];
  if (data?.projection !== 'cube' || !Array.isArray(data.faces) || data.faces.length !== 6)
    throw Error('全景资料不完整，请重新导入六个方向的图片。');
  return order.map((id) => {
    const face = data.faces.find((f) => f.id === id);
    if (!face || face.file !== `face_${id}.jpg` || !/^[a-f0-9]{64}$/.test(face.sha256))
      throw Error('全景图片信息无效。');
    return `/shared/panorama/${face.file}?v=${face.sha256.slice(0, 16)}`;
  });
}

export function openCampusPanorama() {
  return modal(
    '校园实景全景',
    `<div class="panorama-toolbar" role="group" aria-label="选择全景观看方向">${panoramaViews.map((v, i) => `<button class="button secondary" data-pano-view="${i}">${esc(v.label)}</button>`).join('')}</div><div class="panorama-stage" tabindex="0" role="region" aria-label="可拖动环视的校园航拍全景"><p role="status">正在载入实景全景…</p></div><div class="panorama-controls"><button class="button secondary" data-pano-control="left" aria-label="向左环视">↶</button><button class="button secondary" data-pano-control="right" aria-label="向右环视">↷</button><button class="button secondary" data-pano-control="in" aria-label="放大全景">＋</button><button class="button secondary" data-pano-control="out" aria-label="缩小全景">−</button><button class="button secondary" data-pano-control="reset">复位</button><span>拖动环视 · 双指缩放 · 方向键调整</span></div><p class="panorama-status" role="status" aria-live="polite"></p><p class="scene-disclaimer">真实航拍照片 · 单一拍摄位置；楼宇标注与现场可能存在时间差。全景可环视，不能在建筑间自由行走，不用于导航定位。</p><a class="text-btn" href="https://www.720yun.com/t/20ajz0smen0?scene_id=8753864" target="_blank" rel="noopener">资料来源：720云校园全景 ↗</a>`,
    (d) => {
      d.classList.add('campus-panorama-dialog');
      let disposed = false,
        cleanup = () => {};
      Promise.all([
        import('./vendor/three/three.module.min.js'),
        api('/shared/panorama/manifest.json'),
      ])
        .then(([T, data]) => {
          if (!disposed && d.isConnected) cleanup = mountPanorama(d, T, data);
        })
        .catch((e) => {
          if (!disposed && d.isConnected) panoramaError(d, e);
        });
      return () => {
        disposed = true;
        cleanup();
      };
    },
  );
}

function panoramaError(d, e) {
  d.querySelector('.panorama-stage').innerHTML =
    `<div class="panorama-failure"><p role="alert">${esc(e.message || '全景暂时无法显示，请重试。')}</p><button class="button" data-pano-retry>重新载入</button><a href="/shared/panorama/face_b.jpg" target="_blank" rel="noopener">查看主楼原图 ↗</a></div>`;
  d.querySelector('[data-pano-retry]').onclick = openCampusPanorama;
}

function mountPanorama(d, T, data) {
  const urls = panoramaFaces(data),
    host = d.querySelector('.panorama-stage');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: false });
  } catch {
    throw Error('当前浏览器无法显示环视全景，可查看原图或换浏览器重试。');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor('#182832');
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(75, 1, 0.1, 10),
    view = panoramaCamera();
  let disposed = false,
    ready = false,
    texture = null,
    loaded = 0;
  const images = [],
    pointers = new Map(),
    listeners = [];
  const status = d.querySelector('.panorama-status');
  const draw = () => {
    if (disposed || !ready) return;
    const { yaw, pitch, fov } = view.read(),
      y = (yaw * Math.PI) / 180,
      p = (pitch * Math.PI) / 180;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.lookAt(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    renderer.render(scene, camera);
  };
  const listen = (el, type, fn, options) => {
    el.addEventListener(type, fn, options);
    listeners.push(() => el.removeEventListener(type, fn, options));
  };
  const resize = () => {
    if (disposed) return;
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const maxSize = Math.min(
    data.faceSize,
    renderer.capabilities.maxCubemapSize,
    window.matchMedia('(max-width: 650px)').matches ? 1536 : 2500,
  );
  const tasks = urls.map(
    (url, index) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        images.push(image);
        image.onload = () => {
          try {
            if (disposed) return resolve(null);
            loaded++;
            status.textContent = `正在载入实景全景… ${loaded}/6`;
            if (image.width !== data.faceSize || image.height !== data.faceSize)
              return reject(Error('全景图片尺寸不一致。'));
            if (image.width <= maxSize && index !== 2 && index !== 3) return resolve(image);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = maxSize;
            const context = canvas.getContext('2d');
            // The supplied 720 cube's top/bottom convention is rotated 180° relative to Three.js.
            if (index === 2 || index === 3) {
              context.translate(maxSize, maxSize);
              context.rotate(Math.PI);
            }
            context.drawImage(image, 0, 0, maxSize, maxSize);
            resolve(canvas);
          } catch {
            reject(Error('当前浏览器无法处理全景图片，请重试。'));
          }
        };
        image.onerror = () => reject(Error('全景图片载入失败，请检查连接后重试。'));
        image.src = url;
      }),
  );
  const timer = setTimeout(() => fail(Error('全景载入超时，请检查连接后重试。')), 30000);
  function release() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    observer.disconnect();
    listeners.forEach((off) => off());
    pointers.clear();
    images.forEach((img) => {
      img.onload = img.onerror = null;
      img.removeAttribute('src');
    });
    texture?.dispose();
    scene.background = null;
    renderer.dispose();
    renderer.forceContextLoss();
  }
  function fail(error) {
    if (disposed) return;
    release();
    panoramaError(d, error);
  }
  Promise.all(tasks)
    .then((faces) => {
      if (disposed) return;
      clearTimeout(timer);
      texture = new T.CubeTexture(faces);
      texture.colorSpace = T.SRGBColorSpace;
      texture.needsUpdate = true;
      scene.background = texture;
      host.replaceChildren(renderer.domElement);
      ready = true;
      renderer.domElement.setAttribute('aria-label', '北方民族大学实景环视全景');
      status.textContent = '全景已载入';
      resize();
    })
    .catch(fail);
  listen(renderer.domElement, 'webglcontextlost', (e) => {
    e.preventDefault();
    fail(Error('全景显示已中断，请重新载入。'));
  });
  const updateButtons = (index) =>
    d
      .querySelectorAll('[data-pano-view]')
      .forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
  updateButtons(0);
  d.querySelectorAll('[data-pano-view]').forEach((b, i) =>
    listen(b, 'click', () => {
      view.select(panoramaViews[i]);
      updateButtons(i);
      draw();
    }),
  );
  d.querySelectorAll('[data-pano-control]').forEach((b) =>
    listen(b, 'click', () => {
      const c = b.dataset.panoControl;
      if (c === 'reset') {
        view.select(panoramaViews[0]);
        updateButtons(0);
      } else if (c === 'left' || c === 'right') {
        view.turn(c === 'left' ? -15 : 15, 0);
        updateButtons(-1);
      } else view.zoom(c === 'in' ? -8 : 8);
      draw();
    }),
  );
  listen(host, 'pointerdown', (e) => {
    if (!ready || (e.pointerType === 'mouse' && e.button !== 0)) return;
    host.focus();
    host.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
  });
  listen(host, 'pointermove', (e) => {
    const old = pointers.get(e.pointerId);
    if (!old) return;
    if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(old[0] - other[0], old[1] - other[1]);
      const after = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
      view.zoom((before - after) * 0.15);
    } else if (pointers.size === 1) {
      view.turn((old[0] - e.clientX) * 0.16, (e.clientY - old[1]) * 0.16);
      updateButtons(-1);
    }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    draw();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    listen(host, type, (e) => pointers.delete(e.pointerId));
  listen(
    host,
    'wheel',
    (e) => {
      if (!ready) return;
      e.preventDefault();
      view.zoom(Math.sign(e.deltaY) * 4);
      draw();
    },
    { passive: false },
  );
  listen(host, 'keydown', (e) => {
    if (e.target !== host || !ready) return;
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[
      e.key
    ];
    if (delta) {
      e.preventDefault();
      view.turn(...delta);
      updateButtons(-1);
      draw();
    } else if (['+', '-', '='].includes(e.key)) {
      e.preventDefault();
      view.zoom(e.key === '-' ? 8 : -8);
      draw();
    }
  });
  return release;
}
