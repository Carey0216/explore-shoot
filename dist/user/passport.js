import { badgeURL } from '/shared/badge-presets.js';
import { cardStyles, drawPassportCard } from '/shared/passport-card-art.js';
import { $, api, esc, modal, toast } from '/shared/ui.js';
import { atlasHTML, bindAtlas } from '/shared/passport-atlas.js';
const symbols = { building: '▥', moon: '☾', camera: '▣', leaf: '❧', star: '✦', walk: '↟' };
export function achievementHTML(r) {
  return `<article class="passport-stamp ${r.earned ? 'is-earned' : ''}"><div class="stamp-mark" aria-hidden="true"><img src="${badgeURL(r.badgePreset)}" alt="${esc(r.title)}勋章" loading="lazy"></div><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><small>${r.earned ? '已收集' : `${r.progress} / ${r.target}`}</small><progress max="${Number(r.target)}" value="${Number(r.progress)}" aria-label="印章收集进度"></progress></article>`;
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
          `<strong>${esc(b.name)}</strong><span>${b.collected ? '已点亮 · 可以再次留下足迹' : b.pointIds.length ? '下一步：在任一关联地点完成真实打卡，即可点亮' : '待管理员关联点位'}</span><div class="collection-destinations813">${b.pointIds
            .map((id) => {
              const p = state.catalog.points.find((p) => p.id === id);
              return `<div><a class="text-btn" href="#place/${esc(id)}">${esc(p?.name || '查看地点')} ↗</a><small>先查看开放与通行说明</small><button type="button" class="text-btn" data-collection-route="${esc(id)}">规划路线 →</button><a class="button secondary small" href="#checkin/${esc(id)}">到达后打卡</a></div>`;
            })
            .join('')}</div>`;
        host.querySelectorAll('[data-collection-route]').forEach(
          (b) =>
            (b.onclick = () =>
              window.dispatchEvent(
                new CustomEvent('navigation:destination', {
                  detail: { id: b.dataset.collectionRoute },
                }),
              )),
        );
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
              `<button type="button" class="${b.collected ? 'collected' : ''}" data-building-row="${esc(b.id)}"><span>${esc(b.name)}</span><small>${b.collected ? '已点亮' : b.pointIds.length ? '未打卡' : '未关联'}</small></button>`,
          )
          .join('');
        host
          .querySelectorAll('[data-building-row]')
          .forEach((b) => (b.onclick = () => select(b.dataset.buildingRow)));
      };
      draw();
      const requested = new URLSearchParams(location.hash.split('?')[1] || '').get('building');
      const next =
        data.atlas.buildings.find((b) => b.id === requested) ||
        data.atlas.buildings.find((b) => b.frame === 'photo' && !b.collected && b.pointIds.length);
      if (next) {
        frame = next.frame;
        select(next.id);
        if (requested)
          requestAnimationFrame(() =>
            $('#passport-atlas', host)?.scrollIntoView({ block: 'center' }),
          );
      }
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
  let style = 0,
    url = '',
    sequence = 0,
    disposed = false;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) {
    toast('当前浏览器无法生成卡片');
    return;
  }
  const images = earned.slice(0, 6).map(
    (r) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = badgeURL(r.badgePreset);
      }),
  );
  modal(
    '保存护照分享卡片',
    `<p class="muted">仅包含汇总数量和已获得勋章，不含私人照片、感受或定位。</p><img id="passport-card-preview" class="passport-share-card" alt="校园护照分享卡片"><div class="button-row"><button type="button" id="passport-style-next" class="button secondary">换一个样式</button><a id="passport-card-save" class="button" download="校园打卡护照.png">保存卡片</a></div><p id="passport-style-name" class="muted" role="status"></p>`,
    (d) => {
      const draw = async () => {
        const current = ++sequence;
        const loaded = await Promise.all(images);
        if (disposed || !alive() || current !== sequence) return;
        drawPassportCard(context, summary, earned, style, loaded);
        canvas.toBlob((blob) => {
          if (!blob || disposed || !alive() || current !== sequence) return;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          $('#passport-card-preview', d).src = url;
          $('#passport-card-save', d).href = url;
          $('#passport-style-name', d).textContent =
            `${style + 1} / ${cardStyles.length} · ${cardStyles[style][0]}`;
        }, 'image/png');
      };
      $('#passport-style-next', d).onclick = () => {
        style = (style + 1) % cardStyles.length;
        void draw();
      };
      void draw();
      return () => {
        disposed = true;
        sequence++;
        if (url) URL.revokeObjectURL(url);
      };
    },
  );
}
