import { $, esc, icon, modal, toast } from '/shared/ui.js';
import { paintShareQR, pointCodeAreas, posterStyles } from '/shared/passport-card-art.js';
import { shareChoices, bindShareSheet } from './share-sheet.js';
import { mountShareArt, downloadShareArt } from './share-art-editor.js';
export function pointShareURL(point, origin = location.origin) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || !/^[a-z0-9-]{1,60}$/i.test(point.id))
    throw Error('分享地址无效');
  return new URL('/#place/' + encodeURIComponent(point.id) + '?shared=1', base.origin).href;
}
export async function copyPointLink(url) {
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch {}
  if (!copied) {
    const input = document.createElement('textarea');
    input.value = url;
    input.className = 'clipboard-helper';
    (document.querySelector('dialog[open]') || document.body).append(input);
    input.select();
    copied = document.execCommand('copy');
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
export async function miniCode(pointId) {
  const image = new Image();
  image.src =
    '/api/share/mini-code?' + (pointId ? 'point=' + encodeURIComponent(pointId) : 'entry=campus');
  let timer;
  try {
    await Promise.race([
      image.decode(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('小程序码超时')), 5500);
      }),
    ]);
    return image;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
export async function campusShareCodes() {
  const [code, { qrcodegen }] = await Promise.all([
    miniCode(),
    import('/shared/vendor/qr/qrcodegen.js'),
  ]);
  return {
    mini: code,
    qr: qrcodegen.QrCode.encodeText(
      new URL('/', location.origin).href,
      qrcodegen.QrCode.Ecc.MEDIUM,
    ),
  };
}
export async function makePointPoster(point, cover, url, style) {
  const { qrcodegen } = await import('/shared/vendor/qr/qrcodegen.js');
  const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
  const wechatCode = miniCode(point.id);
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('浏览器暂不支持生成图片');
  const dark = style === 2;
  const [, paper, ink, muted] = posterStyles[style];
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 900, 1200);
  ctx.fillStyle = ink;
  ctx.font = '600 30px sans-serif';
  const wordmark = new Image();
  wordmark.src = '/shared/brand/jingyu-' + (dark ? 'dark' : 'light') + '.png';
  let logoTimer;
  try {
    await Promise.race([
      wordmark.decode(),
      new Promise((_, reject) => {
        logoTimer = setTimeout(() => reject(Error('标志加载超时，请重试')), 10000);
      }),
    ]);
  } finally {
    clearTimeout(logoTimer);
  }
  ctx.drawImage(wordmark, 48, 8, 180, 90);
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
  ctx.fillStyle = ink;
  ctx.font = '600 44px sans-serif';
  lines(ctx, point.name, 48, 700, 804, 60, 2);
  ctx.fillStyle = muted;
  ctx.font = '26px sans-serif';
  lines(ctx, point.description, 48, 835, 804, 40, 2);
  const code = await wechatCode;
  paintShareQR(ctx, qr, 48, 950, 200);
  if (code) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(270, 950, 200, 200);
    ctx.drawImage(code, 278, 958, 184, 184);
  }
  ctx.fillStyle = ink;
  ctx.font = '24px sans-serif';
  ctx.fillText('网页二维码', 48, 1180);
  if (code) ctx.fillText('微信小程序码', 270, 1180);
  const x = code ? 512 : 286;
  ctx.font = '600 30px sans-serif';
  ctx.fillText('景遇 · 校园发现', x, 995);
  ctx.font = '24px sans-serif';
  ctx.fillStyle = muted;
  lines(ctx, '看机位、找路线，留下一次校园发现。', x, 1038, 852 - x, 33);
  ctx.font = '21px sans-serif';
  lines(
    ctx,
    point.cover ? '社区公开照片 · 请尊重原作者' : '校园参考配图 · 非机位实拍',
    x,
    1115,
    852 - x,
    30,
  );
  if (!code) ctx.fillText('微信小程序码暂不可用', x, 1160);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error('图片生成失败，请重试'))),
      'image/png',
    ),
  );
  return { blob, codes: pointCodeAreas(Boolean(code)) };
}
export function sharePoint(point, cover) {
  const url = pointShareURL(point);
  modal(
    '分享给',
    `<div class="share-place-summary"><img src="${esc(cover)}" alt="地点参考图"><div><strong>${esc(point.name)}</strong><p>分享此地点，或保存为图片海报</p></div></div>${shareChoices()}<p class="share-status" role="status"></p><details class="share-address"><summary>${icon('pin')}分享地址</summary><input class="share-link-field" aria-label="地点分享链接" readonly value="${esc(url)}"></details>`,
    (d) => {
      const cleanupSheet = bindShareSheet(d);
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
          const style = document.documentElement.dataset.appearance === 'dark' ? 2 : 0;
          const poster = await makePointPoster(point, cover, url, style);
          if (!d.isConnected || !d.open) return;
          openPointPoster(point, cover, url, poster, style);
        } catch (error) {
          status.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };
      return () => {
        cleanupSheet();
      };
    },
  );
}

function openPointPoster(point, cover, url, poster, style) {
  const filename = '校园发现-' + point.name.replace(/[\\/:*?"<>|]/g, '') + '.png';
  modal(
    '分享图片',
    `<div data-share-art></div><div class="poster-actions"><button type="button" class="button secondary" id="poster-style">更换样式</button><button type="button" class="button" id="poster-save">${icon('camera')} 保存图片</button><button type="button" class="button secondary" id="point-share-image">${icon('share')} 发送图片</button><button type="button" class="text-btn" id="poster-copy-link">${icon('copy')} 复制地点链接</button></div><p class="poster-share-note muted" role="status"></p>`,
    (preview) => {
      preview.classList.add('point-poster-dialog');
      const note = $('.poster-share-note', preview);
      const editor = mountShareArt($('[data-share-art]', preview), { label: '地点海报预览' });
      const styleButton = $('#poster-style', preview);
      const save = $('#poster-save', preview);
      const send = $('#point-share-image', preview);
      const setPoster = async (make) => {
        styleButton.disabled = save.disabled = send.disabled = true;
        try {
          const { blob, codes } = await make();
          if (!preview.open) return;
          await editor.setImage(blob, codes);
          note.textContent = posterStyles[style][0];
        } catch (error) {
          note.textContent = error.message;
        } finally {
          styleButton.disabled = save.disabled = send.disabled = false;
        }
      };
      void setPoster(() => poster);
      styleButton.onclick = () => {
        const next = (style + 1) % posterStyles.length;
        return setPoster(async () => {
          const updated = await makePointPoster(point, cover, url, next);
          style = next;
          return updated;
        });
      };
      save.onclick = () =>
        editor
          .file()
          .then((blob) => downloadShareArt(blob, filename))
          .catch((error) => (note.textContent = error.message));
      $('#poster-copy-link', preview).onclick = () =>
        copyPointLink(url).catch((e) => (note.textContent = e.message));
      send.onclick = async () => {
        try {
          const file = new File([await editor.file()], filename, { type: 'image/png' });
          if (!navigator.canShare?.({ files: [file] })) {
            note.textContent = '此浏览器不支持直接发送图片，请保存后发送。';
            return;
          }
          await navigator.share({ files: [file] });
        } catch (e) {
          if (e.name !== 'AbortError') note.textContent = '发送未完成，可先保存图片。';
        }
      };
      return editor.close;
    },
  );
}
