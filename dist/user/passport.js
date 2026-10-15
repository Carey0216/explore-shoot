import { $, api, esc, modal, toast } from '/shared/ui.js';
import { atlasHTML, bindAtlas } from '/shared/passport-atlas.js';
const symbols = { building: '▥', moon: '☾', camera: '▣', leaf: '❧', star: '✦', walk: '↟' };
export function achievementHTML(r) {
  return `<article class="passport-stamp ${r.earned ? 'is-earned' : ''}"><div class="stamp-mark" aria-hidden="true">${symbols[r.symbol] || '✦'}</div><h3 data-i18n-skip>${esc(r.title)}</h3><p data-i18n-skip>${esc(r.description)}</p><small>${r.earned ? '已收集' : `${r.progress} / ${r.target}`}</small><progress max="${Number(r.target)}" value="${Number(r.progress)}" aria-label="印章收集进度"></progress></article>`;
}

export function mountPassport(host, { state }) {
  const owner = state.account?.id;
  let disposed = false;
  const alive = () => !disposed && host.isConnected && state.account?.id === owner;
  const load = async () => {
    host.innerHTML = '<p role="status">正在打开校园护照…</p>';
    try {
      const data = await api('/api/my/passport');
      if (!alive()) return;
      const earned = data.achievements.filter((r) => r.earned);
      host.innerHTML = `<section class="passport-collection"><div class="passport-section-title"><div><span class="eyebrow">CAMPUS PASSPORT</span><h2>把校园一处处点亮</h2></div><button type="button" class="button secondary" id="passport-share">生成分享卡片</button></div><div class="passport-stamps">${data.achievements.map(achievementHTML).join('') || '<p class="empty">主题印章正在准备中，已有打卡会自动计入适用主题。</p>'}</div><p class="muted">成就根据自主打卡记录计算；夜景按北京时间18:00至次日06:00的带照片记录计算，不代表实地认证。</p></section><section class="passport-map-panel"><div class="passport-section-title"><h2>我的校园收集图</h2><div class="button-row"><button class="button secondary small active" data-atlas-frame="photo">俯瞰图</button><button class="button secondary small" data-atlas-frame="plan">楼宇图</button><button class="button secondary small" id="passport-3d">三维</button></div></div><p class="atlas-legend"><i></i> 未打卡 <i class="lit"></i> 已点亮 <span>点击楼宇查看</span></p><div class="atlas-scroll" id="passport-atlas"></div><div id="passport-building-info" class="atlas-selection" aria-live="polite">选择一栋楼，查看关联地点和打卡情况。</div><details><summary>楼宇列表与点亮说明</summary><p class="muted">楼宇需由管理员关联实际点位。未关联的楼宇保持灰色；一个楼宇的任一关联地点有打卡即点亮。图示位置与楼高仅作展示，不用于导航。</p><div id="passport-building-list" class="passport-building-list"></div></details></section>`;
      let frame = 'photo',
        selected = '';
      const select = (id) => {
        const b = data.atlas.buildings.find((x) => x.id === id);
        if (!b) return;
        selected = id;
        $('#passport-building-info', host).innerHTML =
          `<strong data-i18n-skip>${esc(b.name)}</strong><span>${b.collected ? '已点亮' : b.pointIds.length ? '还未打卡' : '待管理员关联点位'}</span><div class="button-row">${b.pointIds.map((id) => `<a class="text-btn" href="#place/${esc(id)}" data-i18n-skip>${esc(state.catalog.points.find((p) => p.id === id)?.name || '查看地点')} ↗</a>`).join('')}</div>`;
        draw();
      };
      const draw = () => {
        const map = $('#passport-atlas', host);
        map.innerHTML = atlasHTML(data.atlas, frame, selected);
        bindAtlas(map, select);
        $('#passport-building-list', host).innerHTML = data.atlas.buildings
          .filter((b) => b.frame === frame)
          .map(
            (b) =>
              `<button type="button" class="${b.collected ? 'collected' : ''}" data-building-row="${esc(b.id)}"><span data-i18n-skip>${esc(b.name)}</span><small>${b.collected ? '已点亮' : b.pointIds.length ? '未打卡' : '未关联'}</small></button>`,
          )
          .join('');
        host
          .querySelectorAll('[data-building-row]')
          .forEach((b) => (b.onclick = () => select(b.dataset.buildingRow)));
      };
      draw();
      host.querySelectorAll('[data-atlas-frame]').forEach(
        (b) =>
          (b.onclick = () => {
            frame = b.dataset.atlasFrame;
            host
              .querySelectorAll('[data-atlas-frame]')
              .forEach((x) => x.classList.toggle('active', x === b));
            draw();
          }),
      );
      $('#passport-3d', host).onclick = async () => {
        try {
          const { openCampusModel } = await import('/shared/campus-model.js');
          if (alive()) openCampusModel('/api/my/passport/scene');
        } catch (e) {
          if (alive()) toast(e.message);
        }
      };
      $('#passport-share', host).onclick = () => shareCard(data.summary, earned, alive);
    } catch (e) {
      if (alive()) {
        host.innerHTML = `<p role="alert">${esc(e.message)}</p><button class="button secondary" id="passport-retry">重试打开护照</button>`;
        $('#passport-retry', host).onclick = load;
      }
    }
  };
  void load();
  return () => {
    disposed = true;
  };
}

function shareCard(summary, earned, alive) {
  // No private photo, note, user ID, timestamp or location is copied into a sharing artifact.
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext('2d');
  if (!c) {
    toast('当前浏览器无法生成卡片，请更换浏览器重试');
    return;
  }
  const gradient = c.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, '#f4efdf');
  gradient.addColorStop(1, '#dcece5');
  c.fillStyle = gradient;
  c.fillRect(0, 0, 1080, 1350);
  c.strokeStyle = '#b5c5bb';
  c.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    c.beginPath();
    c.arc(1000, 1100, 180 + i * 60, 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = '#275348';
  c.font = '28px sans-serif';
  c.fillText('EXPLORE & SHOOT / CAMPUS PASSPORT', 72, 100);
  c.font = 'bold 68px sans-serif';
  c.fillText('我的校园打卡护照', 72, 240);
  c.font = '32px sans-serif';
  c.fillText('北方民族大学', 76, 305);
  c.fillStyle = '#ffffff';
  c.fillRect(72, 380, 936, 190);
  c.fillStyle = '#275348';
  c.font = 'bold 74px sans-serif';
  c.fillText(String(summary.unique), 115, 480);
  c.fillText(String(earned.length), 570, 480);
  c.font = '28px sans-serif';
  c.fillText('处校园足迹', 115, 535);
  c.fillText('枚主题印章', 570, 535);
  c.font = 'bold 35px sans-serif';
  c.fillText('这一次，我收集了', 76, 660);
  c.font = '32px sans-serif';
  earned.slice(0, 6).forEach((r, i) => {
    c.fillStyle = '#275348';
    c.fillText('✦  ' + r.title.slice(0, 22), 90, 740 + i * 68);
  });
  if (!earned.length) c.fillText('第一枚印章，从下次出发开始。', 90, 750);
  if (earned.length > 6) c.fillText('还有 ' + (earned.length - 6) + ' 枚印章', 90, 1160);
  c.font = '24px sans-serif';
  c.fillStyle = '#5c746c';
  c.fillText('自主打卡记录 · 留下自己的校园视角', 76, 1250);
  canvas.toBlob((blob) => {
    if (!alive()) return;
    if (!blob) {
      toast('卡片生成失败，请重试');
      return;
    }
    const url = URL.createObjectURL(blob);
    modal(
      '保存护照分享卡片',
      `<p class="muted">卡片只包含汇总数量和印章，不含私人照片、感受或定位。可下载保存，手机也可长按图片保存。</p><img class="passport-share-card" src="${url}" alt="校园打卡护照分享卡片"><a class="button wide" href="${url}" download="校园打卡护照.png">保存卡片</a>`,
      () => () => URL.revokeObjectURL(url),
    );
  }, 'image/png');
}
