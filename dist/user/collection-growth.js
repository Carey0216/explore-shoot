import { api, esc } from '/shared/ui.js';
import { badgeURL } from '/shared/badge-presets.js';
const en = () => document.documentElement.lang.startsWith('en');
const t = (zh, english) => (en() ? english : zh);
export function growthHTML(items = []) {
  return `<section class="growth820"><h2>${t('我的收集里程碑', 'My collection milestones')}</h2><p class="muted">${t('每次真实打卡，都是下一阶段的开始。片区由管理员维护；季节按专题日期统计。', 'Every real check-in is a step forward. Areas are maintained by the team; seasons follow topic dates.')}</p><div class="growth820-grid">${items.map((m) => `<article class="growth820-stage ${m.earned ? 'earned' : ''}" data-kind="${esc(m.kind)}"><img src="${badgeURL(m.badgePreset)}" alt=""><div><h3>${esc(en() ? m.titleEn : m.title)}</h3><p>${esc(en() ? m.descriptionEn : m.description)}</p><progress max="${Number(m.target)}" value="${Number(m.progress)}" aria-label="${esc(en() ? m.titleEn : m.title)}"></progress><small>${m.earned ? t('已达成', 'Complete') : `${m.progress} / ${m.target}`}</small>${m.nextPointIds?.length ? `<a href="#place/${esc(m.nextPointIds[0])}">${t('下一处可以去这里', 'Your next place')} →</a>` : ''}</div></article>`).join('')}</div></section>`;
}
export function mountTimeline(host, alive) {
  let point = new URLSearchParams(location.hash.split('?')[1] || '').get('point') || '',
    items = [],
    places = [],
    page = 1,
    selected = [1, 0],
    loading = false,
    sequence = 0;
  const date = (r) =>
    new Date(r.date).toLocaleString(en() ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const render = () => {
    const list = items.filter((x) => x.pointId === point),
      a = list[selected[0]] || list[0],
      b = list[selected[1]] || a;
    host.innerHTML = `<section class="timeline820"><h2>${t('同一个地方，不同的时间', 'Same place, different times')}</h2><p class="muted">${t('只使用你自己的打卡照片。日期为打卡时间；不会自动公开。', 'Only your own check-in photos. Dates are check-in times; nothing is published automatically.')}</p><label>${t('选择地点', 'Choose a place')}<select data-place>${places.map((p) => `<option value="${esc(p.id)}" ${p.id === point ? 'selected' : ''}>${esc(p.name)} · ${p.count}</option>`).join('')}</select></label>${a ? `<div class="timeline820-pair"><label>${t('之前', 'Before')}<select data-pick="0">${list.map((r, i) => `<option value="${i}" ${i === selected[0] ? 'selected' : ''}>${esc(date(r))}</option>`).join('')}</select></label><label>${t('后来', 'After')}<select data-pick="1">${list.map((r, i) => `<option value="${i}" ${i === selected[1] ? 'selected' : ''}>${esc(date(r))}</option>`).join('')}</select></label></div><div class="timeline820-compare"><img src="${esc(b.photo)}" alt="${esc(date(b))}"><img class="timeline820-before" src="${esc(a.photo)}" alt="${esc(date(a))}"><span class="timeline820-divider"></span><button class="button secondary timeline820-retry" hidden>${t('照片加载失败，点此重试', 'Photo unavailable. Retry')}</button></div><label class="timeline820-slider">${t('左右滑动，比较变化', 'Slide to compare')}<input type="range" min="0" max="100" value="50" aria-label="${t('照片对比位置', 'Photo comparison position')}"></label>${list.length < 2 ? `<p class="muted">${t('这里还只有一张照片。照着它再拍一次，就能比较变化。', 'There is one photo here. Retake it to compare the change.')}</p>` : ''}<button class="button secondary" data-retake ${!a.canRetake ? 'disabled' : ''}>${t('按之前这张照片再拍一次', 'Retake the earlier photo')} ↗</button>${!a.canRetake ? `<small>${t('当前地点未开放取景，请先查看地点信息。', 'This place is not currently open for framing. Check its details first.')}</small>` : ''}<ol class="timeline820-list">${list.map((r, i) => `<li><button data-select="${i}" aria-label="${esc(date(r))}"><img src="${esc(r.photo)}" loading="lazy" alt=""></button><div><strong>${esc(date(r))}</strong><small>${t({ spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[r.season] || '', r.season)} · ${t(r.time === 'day' ? '白天' : '傍晚', r.time === 'day' ? 'Day' : 'Evening')}</small>${r.note ? `<p>${esc(r.note)}</p>` : ''}</div></li>`).join('')}</ol>${host.dataset.more === 'true' ? `<button class="button secondary" data-more>${t('查看更早的照片', 'Earlier photos')}</button>` : ''}` : `<p class="empty">${t('在地点完成一次带照片的打卡，就能从这里开始你的时间线。', 'Check in with a photo to start your personal timeline.')}</p>`}<p data-error role="status"></p></section>`;
    host.querySelector('[data-place]').onchange = (e) => {
      point = e.target.value;
      page = 1;
      selected = [1, 0];
      items = [];
      render();
      void load();
    };
    host.querySelectorAll('[data-pick]').forEach(
      (el) =>
        (el.onchange = (e) => {
          selected[Number(el.dataset.pick)] = Number(e.target.value);
          render();
        }),
    );
    host
      .querySelector('input[type=range]')
      ?.addEventListener('input', (e) =>
        host
          .querySelector('.timeline820-compare')
          .style.setProperty('--split', `${e.target.value}%`),
      );
    host.querySelectorAll('[data-select]').forEach(
      (el) =>
        (el.onclick = () => {
          selected = [Number(el.dataset.select), 0];
          render();
        }),
    );
    const retry = host.querySelector('.timeline820-retry');
    host.querySelectorAll('.timeline820-compare img').forEach(
      (img) =>
        (img.onerror = () => {
          retry.hidden = false;
        }),
    );
    if (retry)
      retry.onclick = () => {
        retry.hidden = true;
        host.querySelectorAll('.timeline820-compare img').forEach((img) => {
          const src = img.src;
          img.removeAttribute('src');
          img.src = src;
        });
      };
    host.querySelector('[data-retake]')?.addEventListener('click', async () => {
      try {
        const { openFraming } = await import('./framing.js');
        if (alive())
          openFraming({
            id: '',
            pointId: a.pointId,
            title: a.pointName,
            photo: a.photo,
            referenceOnly: true,
            standDescription: t(
              '用你之前的照片对齐画面。请先确认现场可通行，再主动开启相机。',
              'Align with your earlier photo. Check access on site, then start the camera.',
            ),
            heightAdvice: t(
              '日期为打卡记录时间；旧照片不能证明当前现场情况。',
              'The date is the check-in time; an older photo does not verify current conditions.',
            ),
          });
      } catch (e) {
        if (alive()) host.querySelector('[data-error]').textContent = e.message;
      }
    });
    host.querySelector('[data-more]')?.addEventListener('click', () => {
      void load(true);
    });
  };
  const load = async (append = false) => {
    if (append && loading) return;
    loading = true;
    const run = ++sequence,
      requestedPoint = point,
      requestedPage = append ? page + 1 : 1;
    try {
      const data = await api(
        '/api/my/passport/timeline?point=' +
          encodeURIComponent(requestedPoint) +
          '&page=' +
          requestedPage,
      );
      if (!alive() || run !== sequence) return;
      places = data.places;
      items = append ? [...items, ...data.items] : data.items;
      page = requestedPage;
      host.dataset.more = String(data.hasMore);
      if (!point && places.length) {
        point = places[0].id;
        loading = false;
        return load();
      }
      render();
    } catch (e) {
      if (alive() && run === sequence) {
        host.innerHTML = `<p role="alert">${esc(e.message)}</p><button class="button secondary">${t('重试时间线', 'Retry timeline')}</button>`;
        host.querySelector('button').onclick = () => load(append);
      }
    } finally {
      if (run === sequence) loading = false;
    }
  };
  void load();
}
