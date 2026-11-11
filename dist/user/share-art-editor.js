import { drawShareArtwork, shareInk } from '/shared/passport-card-art.js';

export function mountShareArt(host, { label, long = false }) {
  host.innerHTML = `
    <div class="poster-image-stage ${long ? 'poster-image-long' : ''}"><canvas aria-label="${label}"></canvas></div>
    <div class="share-art-tools">
      <div class="button-row" role="group" aria-label="画笔和贴图">
        <button type="button" class="button secondary" data-art="pen" aria-pressed="false">画笔</button>
        <button type="button" class="button secondary" data-art="sparkle" aria-pressed="false">✦ 星光</button>
        <button type="button" class="button secondary" data-art="heart" aria-pressed="false">♡ 爱心</button>
        <button type="button" class="button secondary" data-art="mountain" aria-pressed="false">△ 山峰</button>
      </div>
      <div class="button-row" role="group" aria-label="画笔与贴图颜色">
        ${shareInk.map((color, index) => `<button type="button" class="share-ink" data-ink="${index}" style="--ink:${color}" aria-pressed="${index === 2}" aria-label="${['白色', '蓝色', '玫红', '金色'][index]}"></button>`).join('')}
        <button type="button" class="text-btn" data-undo disabled>撤销</button>
      </div>
      <p class="muted share-art-hint" role="status">选择画笔或贴图，在图片上添加。</p>
      <details class="share-art-guide">
        <summary>查看涂画演示</summary>
        <div class="art-guide-preview" aria-hidden="true">
          <i class="art-guide-stroke"></i><span>网页码</span><span>小程序码</span>
        </div>
        <p class="muted">选择工具，在图片上拖动画笔或点按贴图。两个扫码区始终盖在最上层。</p>
        <button type="button" class="text-btn" data-art-replay>重播</button>
      </details>
    </div>`;
  const canvas = host.querySelector('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw Error('浏览器暂不支持编辑图片');
  const tools = [...host.querySelectorAll('[data-art]')];
  const inks = [...host.querySelectorAll('[data-ink]')];
  const undo = host.querySelector('[data-undo]');
  const hint = host.querySelector('.share-art-hint');
  const guide = host.querySelector('.share-art-guide');
  const line = guide.querySelector('.art-guide-stroke');
  const replay = () => {
    line.classList.remove('playing');
    void line.offsetWidth;
    line.classList.add('playing');
  };
  guide.ontoggle = () => {
    if (guide.open) replay();
  };
  guide.querySelector('[data-art-replay]').onclick = replay;
  const marks = [];
  let image,
    source,
    codes = [],
    color = shareInk[2],
    tool = '',
    stroke,
    pointer,
    disposed = false,
    generation = 0;
  const draw = () => {
    if (!image || disposed) return;
    drawShareArtwork(context, image, canvas.width, canvas.height, marks, codes);
    undo.disabled = !marks.length;
  };
  const point = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return [
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height,
    ];
  };
  const inImage = (pair) => pair.every((value) => value >= 0 && value <= 1);
  const add = (kind, position) => {
    if (marks.length >= 80) {
      hint.textContent = '已达到装饰上限，可以撤销一笔后继续。';
      return null;
    }
    const mark = { kind, color, points: [position] };
    marks.push(mark);
    draw();
    return mark;
  };
  for (const button of tools) {
    button.onclick = (event) => {
      tool = tool === button.dataset.art ? '' : button.dataset.art;
      for (const item of tools)
        item.setAttribute('aria-pressed', String(item.dataset.art === tool));
      canvas.classList.toggle('share-art-active', Boolean(tool));
      hint.textContent = !tool
        ? '选择画笔或贴图，在图片上添加。'
        : tool === 'pen'
          ? '在图片上拖动绘制，扫码区保留在最上层。'
          : '点按图片放置贴图，扫码区保留在最上层。';
      if (event.detail === 0 && image && tool && tool !== 'pen') add(tool, [0.78, 0.22]);
    };
  }
  for (const button of inks) {
    button.onclick = () => {
      color = shareInk[Number(button.dataset.ink)];
      for (const item of inks) item.setAttribute('aria-pressed', String(item === button));
    };
  }
  undo.onclick = () => {
    marks.pop();
    draw();
  };
  canvas.onpointerdown = (event) => {
    if (!tool || !image || pointer != null || event.button !== 0) return;
    const position = point(event);
    if (!inImage(position)) return;
    const mark = add(tool, position);
    if (tool !== 'pen' || !mark) return;
    stroke = mark;
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
  };
  canvas.onpointermove = (event) => {
    if (!stroke || event.pointerId !== pointer || stroke.points.length >= 320) return;
    const position = point(event);
    if (!inImage(position)) return;
    stroke.points.push(position);
    draw();
  };
  canvas.onlostpointercapture = () => {
    stroke = null;
    pointer = null;
  };
  return {
    async setImage(blob, protectedAreas) {
      const current = ++generation;
      const url = URL.createObjectURL(blob);
      const next = new Image();
      try {
        next.src = url;
        await next.decode();
        if (disposed || current !== generation) return;
        image = next;
        source = blob;
        codes = protectedAreas;
        canvas.width = next.naturalWidth;
        canvas.height = next.naturalHeight;
        draw();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    file() {
      if (!image || disposed) return Promise.reject(Error('请等待图片生成'));
      if (!marks.length) return Promise.resolve(source);
      return new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(Error('图片生成失败'))),
          'image/png',
        ),
      );
    },
    close() {
      disposed = true;
      image = source = null;
      canvas.width = canvas.height = 1;
    },
  };
}

export function downloadShareArt(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
