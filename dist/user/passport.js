import { growthHTML, mountTimeline } from './collection-growth.js';
import { badgeURL } from '/shared/badge-presets.js';
import {
  cardStyles,
  drawPassportCard,
  drawCampusShareFooter,
  shareFooterHeight,
  campusCodeAreas,
} from '/shared/passport-card-art.js';
import { campusShareCodes } from './place-share.js';
import { mountShareArt, downloadShareArt } from './share-art-editor.js';
import { $, api, esc, modal, toast } from '/shared/ui.js';
import { atlasHTML, bindAtlas } from '/shared/passport-atlas.js';
import { nearestCollectionBuilding } from '/shared/collection-distance.js';
import { freshBrowserLocation } from '/shared/fresh-location.js';
const symbols = { building: '▥', moon: '☾', camera: '▣', leaf: '❧', star: '✦', walk: '↟' };
export function achievementHTML(r) {
  return `<article class="passport-stamp ${r.earned ? 'is-earned' : ''}"><div class="stamp-mark" aria-hidden="true"><img src="${badgeURL(r.badgePreset)}" alt="${esc(r.title)}勋章" loading="lazy"></div><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><small>${r.earned ? '已收集' : `${r.progress} / ${r.target}`}</small><progress max="${Number(r.target)}" value="${Number(r.progress)}" aria-label="印章收集进度"></progress></article>`;
}

export function mountPassport(host, { state }) {
  const owner = state.account?.id;
  let disposed = false;
  let cancelLocation;
  const alive = () => !disposed && host.isConnected && state.account?.id === owner;
  const load = async () => {
    host.innerHTML = '<p role="status">正在打开校园护照…</p>';
    try {
      const data = await api('/api/my/passport');
      if (!alive()) return;
      const earned = data.achievements.filter((r) => r.earned);
      host.innerHTML = `<section class="passport-collection"><div class="passport-section-title"><div><span class="eyebrow">CAMPUS PASSPORT</span><h2>把校园一处处点亮</h2></div><button type="button" class="button secondary" id="passport-share">生成分享卡片</button></div><div class="passport-stamps">${
        data.achievements.length
          ? [0, 1]
              .map(
                (column) =>
                  '<div class="passport-stamp-column821">' +
                  data.achievements
                    .filter((_, index) => index % 2 === column)
                    .map(achievementHTML)
                    .join('') +
                  '</div>',
              )
              .join('')
          : '<p class="empty">主题印章正在准备中，已有打卡会自动计入适用主题。</p>'
      }</div><p class="muted">成就根据自主打卡记录计算；夜景按北京时间18:00至次日06:00的带照片记录计算，不代表实地认证。</p></section><section class="passport-map-panel"><div class="passport-section-title"><h2>我的校园收集图</h2><div class="button-row"><button class="button secondary small active" data-atlas-frame="photo">俯瞰图</button><button class="button secondary small" data-atlas-frame="plan">楼宇图</button><button class="button secondary small" id="passport-3d">三维</button></div></div><p class="atlas-legend"><i></i> 未打卡 <i class="selected"></i> 已选中 <i class="lit"></i> 已点亮 <span>点击楼宇查看</span></p><div class="atlas-scroll" id="passport-atlas"></div><div id="passport-building-info" class="atlas-selection" aria-live="polite">选择一栋楼，查看关联地点和打卡情况。</div><details><summary>楼宇列表与点亮说明</summary><p class="muted">楼宇需由管理员关联实际点位。未关联的楼宇保持灰色；一个楼宇的任一关联地点有打卡即点亮。图示位置与楼高仅作展示，不用于导航。</p><div id="passport-building-list" class="passport-building-list"></div></details></section>`;
      host.insertAdjacentHTML('beforeend', '<div id="passport-timeline820"></div>');
      host
        .querySelector('.passport-map-panel')
        .insertAdjacentHTML('beforebegin', growthHTML(data.milestones));
      mountTimeline(host.querySelector('#passport-timeline820'), alive);
      let frame = 'photo',
        selected = '',
        buildingLimit = 5;
      const setFrame = (value) => {
        frame = value;
        buildingLimit = 5;
        host
          .querySelectorAll('[data-atlas-frame]')
          .forEach((button) =>
            button.classList.toggle('active', button.dataset.atlasFrame === frame),
          );
      };
      const select = (id, reveal = false) => {
        const b = data.atlas.buildings.find((x) => x.id === id);
        if (!b) return;
        selected = id;
        const points =
          b.points ||
          b.pointIds
            .map((pointId) => state.catalog.points.find((point) => point.id === pointId))
            .filter(Boolean);
        const card = $('#passport-building-info', host);
        card.classList.add('atlas-building-guide');
        card.innerHTML = `<div class="atlas-guide-header"><span>已选楼宇</span><small>${b.collected ? '已点亮' : '尚未点亮'}</small></div><strong>${esc(b.displayName || points[0]?.name || b.name)}</strong><p class="muted">${points.length ? '先查看路线，到达关联地点后即可打卡。' : b.pointIds.length ? '暂无可查看的公开点位。' : '这栋楼还在等待关联校园点位。'}</p>${points
          .map(
            (point) =>
              `<div class="atlas-guide-stop">${points.length > 1 ? `<strong>${esc(point.name)}</strong>` : ''}${point.open ? '' : '<p class="muted">当前标记为关闭</p>'}<div class="atlas-guide-actions">${point.open ? `<button type="button" class="button" data-collection-route="${esc(point.id)}">去这里 · 看路线</button>` : ''}<a class="button secondary" href="#place/${esc(point.id)}">查看点位</a></div>${point.open ? `<a class="text-btn atlas-guide-checkin" href="#checkin/${esc(point.id)}">到达后打卡 ↗</a>` : ''}</div>`,
          )
          .join('')}`;
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
        if (reveal) {
          const { top, height } = card.getBoundingClientRect();
          if (top < 0 || top + Math.min(height, 210) > window.innerHeight - 24)
            card.scrollIntoView({ block: 'nearest' });
        }
      };
      const draw = () => {
        const map = $('#passport-atlas', host);
        map.innerHTML = atlasHTML(data.atlas, frame, selected);
        bindAtlas(map, (id) => select(id, true));
        $('#passport-building-list', host).innerHTML = data.atlas.buildings
          .filter((b) => b.frame === frame)
          .slice(0, buildingLimit)
          .map(
            (b) =>
              `<button type="button" aria-pressed="${b.id === selected}" class="${b.collected ? 'collected' : ''}" data-building-row="${esc(b.id)}"><span>${esc(b.displayName || b.name)}</span><small>${b.collected ? '已点亮' : b.pointIds.length ? '未打卡' : '未关联'}</small></button>`,
          )
          .join('');
        if (data.atlas.buildings.filter((b) => b.frame === frame).length > buildingLimit) {
          const list = $('#passport-building-list', host);
          list.insertAdjacentHTML(
            'beforeend',
            '<button type="button" class="text-btn" data-more-buildings>再显示五栋</button>',
          );
          $('[data-more-buildings]', list).onclick = () => {
            buildingLimit += 5;
            draw();
          };
        }
        host
          .querySelectorAll('[data-building-row]')
          .forEach((b) => (b.onclick = () => select(b.dataset.buildingRow, true)));
      };
      draw();
      const requested = new URLSearchParams(location.hash.split('?')[1] || '').get('building');
      const candidates = data.nextBuildings || [];
      if (candidates.length) {
        const heading = host.querySelector('.passport-map-panel .passport-section-title');
        heading.insertAdjacentHTML(
          'afterend',
          '<div class="atlas-selection"><strong>下一栋</strong><p data-collection-next role="status"></p><div class="button-row"><button type="button" class="button secondary small" data-collection-show>在图上查看</button><button type="button" class="button secondary small" data-collection-near>按我的位置推荐</button></div></div>',
        );
        let recommendation = candidates[0];
        const status = $('[data-collection-next]', host);
        const update = () => {
          const reason =
            recommendation.metres !== undefined
              ? `距你约 ${recommendation.metres} 米（直线距离）`
              : recommendation.reason === 'plan'
                ? '是你拍摄计划中的下一站'
                : '已关联可前往地点，完成打卡即可点亮';
          status.textContent = `${recommendation.name} · ${reason}。实际开放以现场为准。`;
        };
        const show = () => {
          setFrame('photo');
          select(recommendation.buildingId);
          $('#passport-atlas', host).scrollIntoView({ block: 'center' });
        };
        update();
        $('[data-collection-show]', host).onclick = show;
        const nearby = $('[data-collection-near]', host);
        nearby.hidden = !navigator.geolocation;
        nearby.onclick = () => {
          nearby.disabled = true;
          status.textContent = '正在定位…';
          cancelLocation = freshBrowserLocation().getCurrentPosition(
            ({ coords }) => {
              if (!alive()) return;
              nearby.disabled = false;
              const result = nearestCollectionBuilding(
                candidates,
                coords.longitude,
                coords.latitude,
              );
              if (result) recommendation = result;
              update();
              if (result) show();
            },
            () => {
              if (!alive()) return;
              nearby.disabled = false;
              update();
              toast('未取得当前位置，仍可查看原推荐');
            },
            { timeout: 8000 },
          );
        };
      }
      const next =
        data.atlas.buildings.find((b) => b.id === requested) ||
        data.atlas.buildings.find((b) => b.id === candidates[0]?.buildingId) ||
        data.atlas.buildings.find(
          (b) => b.frame === 'photo' && !b.collected && b.points?.some((point) => point.open),
        );
      if (next) {
        setFrame(next.frame);
        select(next.id);
        if (requested)
          requestAnimationFrame(() =>
            $('#passport-atlas', host)?.scrollIntoView({ block: 'center' }),
          );
      }
      host.querySelectorAll('[data-atlas-frame]').forEach(
        (b) =>
          (b.onclick = () => {
            setFrame(b.dataset.atlasFrame);
            if (
              data.atlas.buildings.some(
                (building) => building.id === selected && building.frame === frame,
              )
            )
              draw();
            else {
              selected = '';
              const card = $('#passport-building-info', host);
              card.classList.remove('atlas-building-guide');
              card.textContent = '选择一栋楼，查看关联地点和打卡情况。';
              draw();
            }
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
    cancelLocation?.();
  };
}

function shareCard(summary, earned, alive) {
  let style = 0,
    sequence = 0,
    disposed = false;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350 + shareFooterHeight;
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
  const codes = campusShareCodes().catch(() => ({}));
  modal(
    '保存护照分享卡片',
    `<p class="muted">分享卡包含汇总数量和已获得的勋章。</p><div data-share-art></div><div class="button-row"><button type="button" id="passport-style-next" class="button secondary">换一个样式</button><button type="button" id="passport-card-save" class="button" disabled>保存卡片</button></div><p id="passport-style-name" class="muted" role="status"></p>`,
    (d) => {
      const editor = mountShareArt($('[data-share-art]', d), { label: '校园护照分享卡片' });
      const save = $('#passport-card-save', d);
      const status = $('#passport-style-name', d);
      save.onclick = () =>
        editor
          .file()
          .then((blob) => downloadShareArt(blob, '校园打卡护照.png'))
          .catch((error) => (status.textContent = error.message));
      const draw = async () => {
        const current = ++sequence;
        save.disabled = true;
        const [loaded, shareCodes] = await Promise.all([Promise.all(images), codes]);
        if (disposed || !alive() || current !== sequence) return;
        drawPassportCard(context, summary, earned, style, loaded);
        drawCampusShareFooter(context, canvas.width, 1350, shareCodes);
        canvas.toBlob(async (blob) => {
          if (disposed || !alive() || current !== sequence) return;
          try {
            if (!blob) throw Error('分享卡生成失败');
            await editor.setImage(blob, campusCodeAreas(canvas.width, 1350, shareCodes));
            if (disposed || current !== sequence) return;
            save.disabled = false;
            status.textContent = `${style + 1} / ${cardStyles.length} · ${cardStyles[style][0]}`;
          } catch (error) {
            if (!disposed && current === sequence) status.textContent = error.message;
          }
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
        editor.close();
      };
    },
  );
}
