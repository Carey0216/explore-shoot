import { $, esc, icon, modal, toast } from '/shared/ui.js';
export function pointShareURL(point, origin = location.origin) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || !/^[a-z0-9-]{1,60}$/i.test(point.id))
    throw Error('分享地址无效');
  return new URL('/#place/' + encodeURIComponent(point.id) + '?shared=1', base.origin).href;
}
export async function copyPointLink(url) {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
  else {
    const input = document.createElement('textarea');
    input.value = url;
    input.className = 'clipboard-helper';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw Error('未能复制，请长按分享地址手动复制');
  }
  toast('链接已复制', { center: true });
}
function lines(ctx, text, x, y, width, height, max = 2) {
  let line = '',
    count = 0;
  for (const char of String(text || '')) {
    if (ctx.measureText(line + char).width > width && line) {
      ctx.fillText(line, x, y);
      line = '';
      y += height;
      if (++count >= max) return;
    }
    line += char;
  }
  if (line) ctx.fillText(line, x, y);
}
export function paintQR(ctx, qr, x, y, edge) {
  const quiet = 4,
    unit = Math.floor(edge / (qr.size + quiet * 2)),
    total = unit * (qr.size + quiet * 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, total, total);
  ctx.fillStyle = '#000';
  for (let row = 0; row < qr.size; row++)
    for (let col = 0; col < qr.size; col++)
      if (qr.getModule(col, row))
        ctx.fillRect(x + (col + quiet) * unit, y + (row + quiet) * unit, unit, unit);
}
export async function makePointPoster(point, cover, url) {
  const { qrcodegen } = await import('/shared/vendor/qr/qrcodegen.js');
  const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('浏览器暂不支持生成图片');
  ctx.fillStyle = '#f4f5ef';
  ctx.fillRect(0, 0, 900, 1200);
  ctx.fillStyle = '#254c61';
  ctx.font = '600 30px sans-serif';
  ctx.fillText('探索与拍摄  /  校园发现', 48, 65);
  const image = new Image();
  image.decoding = 'async';
  const source = new URL(cover, location.origin);
  if (source.origin !== location.origin) throw Error('分享图片仅使用本站公开照片');
  image.src = source.href;
  let imageTimer;
  try {
    await Promise.race([
      image.decode(),
      new Promise((_, reject) => {
        imageTimer = setTimeout(() => reject(Error('图片加载超时')), 15000);
      }),
    ]);
    const factor = Math.max(804 / image.naturalWidth, 520 / image.naturalHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(48, 105, 804, 520);
    ctx.clip();
    ctx.drawImage(
      image,
      48 + (804 - image.naturalWidth * factor) / 2,
      105 + (520 - image.naturalHeight * factor) / 2,
      image.naturalWidth * factor,
      image.naturalHeight * factor,
    );
    ctx.restore();
  } catch {
    ctx.fillStyle = '#e0e8e4';
    ctx.fillRect(48, 105, 804, 520);
    ctx.fillStyle = '#435961';
    ctx.font = '32px sans-serif';
    ctx.fillText('去校园里，发现一个新角度', 210, 370);
  } finally {
    clearTimeout(imageTimer);
  }
  ctx.fillStyle = '#1c3546';
  ctx.font = '600 44px sans-serif';
  lines(ctx, point.name, 48, 700, 804, 60, 2);
  ctx.fillStyle = '#526975';
  ctx.font = '26px sans-serif';
  lines(ctx, point.description, 48, 835, 804, 40, 2);
  paintQR(ctx, qr, 48, 958, 216);
  ctx.fillStyle = '#254c61';
  ctx.font = '600 30px sans-serif';
  ctx.fillText('扫码，打开这个地点', 300, 1010);
  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#526975';
  ctx.fillText('看机位 · 找路线 · 留下自己的校园发现', 300, 1062);
  ctx.font = '21px sans-serif';
  ctx.fillText(
    point.cover ? '社区公开照片 · 请尊重原作者' : '校园参考配图 · 非机位实拍',
    300,
    1112,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error('图片生成失败，请重试'))),
      'image/png',
    ),
  );
}
export function sharePoint(point, cover) {
  const url = pointShareURL(point);
  modal(
    '分享这个地点',
    `<p class="muted">把这个校园角落，分享给想一起去的人。</p><div class="place-share-actions"><button class="button" id="point-copy-link">${icon('copy')} 复制链接</button><button class="button secondary" id="point-poster">${icon('camera')} 生成分享图片</button><button class="button secondary" id="point-native-share">${icon('arrow')} 系统分享</button><button class="button secondary" data-share-app="weixin://">微信</button><button class="button secondary" data-share-app="mqq://">QQ</button></div><p class="share-status" role="status"></p><input class="share-link-field" aria-label="地点分享链接" readonly value="${esc(url)}"><div id="point-poster-preview" hidden></div>`,
    (d) => {
      const status = $('.share-status', d);
      $('#point-copy-link', d).onclick = () =>
        copyPointLink(url).catch((e) => (status.textContent = e.message));
      $('#point-native-share', d).onclick = async () => {
        if (!navigator.share) {
          await copyPointLink(url).catch((e) => (status.textContent = e.message));
          status.textContent = '此浏览器没有系统分享，可把链接粘贴到微信、QQ等应用。';
          return;
        }
        try {
          await navigator.share({
            title: point.name,
            text: '和我一起发现校园：' + point.name,
            url,
          });
        } catch (e) {
          if (e.name !== 'AbortError') status.textContent = '暂时无法分享，可使用复制链接。';
        }
      };
      d.querySelectorAll('[data-share-app]').forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              await copyPointLink(url);
              status.textContent = '链接已复制，请在打开的应用中粘贴。若没有跳转，可手动切换应用。';
              location.assign(b.dataset.shareApp);
            } catch (e) {
              status.textContent = e.message;
            }
          }),
      );
      $('#point-poster', d).onclick = async (e) => {
        const button = e.currentTarget;
        button.disabled = true;
        status.textContent = '正在生成分享图片…';
        try {
          const blob = await makePointPoster(point, cover, url);
          if (!d.isConnected || !d.open) return;
          const objectURL = URL.createObjectURL(blob),
            preview = $('#point-poster-preview', d);
          preview.hidden = false;
          preview.innerHTML = `<img src="${objectURL}" alt="${esc(point.name)}的分享图片，附带直达地点二维码"><a class="button" download="校园发现-${esc(point.name.replace(/[\\/:*?"<>|]/g, ''))}.png" href="${objectURL}">保存图片</a><button class="button secondary" id="point-share-image">分享图片到应用</button><small>也可长按图片保存，再发送给朋友。</small>`;
          const file = new File([blob], '校园发现.png', { type: 'image/png' });
          $('#point-share-image', d).onclick = async () => {
            if (!navigator.canShare?.({ files: [file] })) {
              status.textContent = '当前浏览器不支持直接分享图片，请先保存再发送。';
              return;
            }
            try {
              await navigator.share({ files: [file] });
            } catch (e) {
              if (e.name !== 'AbortError') status.textContent = '分享未完成，可先保存图片。';
            }
          };
          d.addEventListener('close', () => URL.revokeObjectURL(objectURL), { once: true });
          status.textContent = '分享图片已生成，可保存或发送。';
          button.hidden = true;
        } catch (error) {
          status.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };
    },
  );
}
