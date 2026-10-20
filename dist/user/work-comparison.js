import { $, api, esc, thumbnail } from '/shared/ui.js';
const seasons = {
  all: '全部季节',
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
  unknown: '未注明时间',
};
const times = {
  all: '全部时段',
  morning: '清晨 6—10时',
  day: '白天 10—17时',
  evening: '傍晚 17—20时',
  night: '夜间 20—6时',
  unknown: '未注明时间',
};
export async function mountComparison(root, spotId, alive, onRender = () => {}) {
  let sequence = 0,
    page = 1;
  root.innerHTML = `<header class="comparison-heading"><div><span class="eyebrow">同一个角落，不同的光</span><h2>看看大家怎么拍</h2></div></header><form class="comparison-filters"><label><span class="sr-only">作品季节</span><select name="season" aria-label="作品季节">${Object.entries(
    seasons,
  )
    .map(([id, label]) => `<option value="${id}">${label}</option>`)
    .join(
      '',
    )}</select></label><label><span class="sr-only">拍摄时段</span><select name="time" aria-label="拍摄时段">${Object.entries(
    times,
  )
    .map(([id, label]) => `<option value="${id}">${label}</option>`)
    .join(
      '',
    )}</select></label></form><p class="muted">按作者自填拍摄时间归类，仅展示主动公开并审核通过的作品。</p><p class="comparison-status" role="status"></p><div class="comparison-grid"></div><button class="button secondary wide" id="comparison-more" hidden>加载更多作品</button>`;
  const form = $('form', root),
    load = async (append) => {
      const serial = ++sequence,
        button = $('#comparison-more', root);
      button.disabled = true;
      $('.comparison-status', root).textContent = '正在查找公开作品…';
      try {
        const data = await api(
          '/api/works/compare?spotId=' +
            encodeURIComponent(spotId) +
            '&season=' +
            form.elements.season.value +
            '&time=' +
            form.elements.time.value +
            '&page=' +
            (append ? page + 1 : 1),
        );
        if (!alive() || !root.isConnected || serial !== sequence) return;
        page = data.page;
        const html = data.items
          .map(
            (w) =>
              `<article class="comparison-work"><a href="${esc(w.photo)}" target="_blank" rel="noopener noreferrer" aria-label="查看${esc(w.authorName)}的公开作品"><img src="${esc(thumbnail(w.photo))}" width="480" height="600" loading="lazy" decoding="async" alt="同机位公开作品"></a><div><h3>${esc(w.caption || '一个新的视角')}</h3><small>${esc(w.authorName)} · ${w.experience?.takenAt ? new Date(w.experience.takenAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '拍摄时间未注明'}</small>${w.experience?.tips ? `<p>${esc(w.experience.tips)}</p>` : ''}<p class="muted">${esc([w.experience?.device, w.experience?.focalLength].filter(Boolean).join(' · '))}</p><button type="button" class="text-btn" data-work-report="${esc(w.id)}">举报作品</button></div></article>`,
          )
          .join('');
        if (append) $('.comparison-grid', root).insertAdjacentHTML('beforeend', html);
        else
          $('.comparison-grid', root).innerHTML =
            html || '<p class="empty">这个季节／时段还没有公开作品，试试其他筛选。</p>';
        $('.comparison-status', root).textContent = `共 ${data.total} 张公开作品`;
        button.hidden = !data.hasMore;
        onRender();
      } catch (error) {
        if (alive() && serial === sequence)
          $('.comparison-status', root).textContent = error.message;
      } finally {
        if (root.isConnected) button.disabled = false;
      }
    };
  form.onchange = () => void load(false);
  form.onsubmit = (e) => e.preventDefault();
  $('#comparison-more', root).onclick = () => void load(true);
  await load(false);
}
