import { api, esc, icon } from '/shared/ui.js';
import { badgeURL } from '/shared/badge-presets.js';
import { showFeatureTour, tourIsOpen } from '/shared/feature-tour.js';
let island, timeout;
export function dismissActivityReward() {
  clearTimeout(timeout);
  island?.remove();
  island = null;
}
export function showActivityReward(topic) {
  dismissActivityReward();
  const pending = topic.stamps.filter((s) => !s.earned),
    stamp = pending[0] || topic.stamps[0];
  const title =
    topic.phase === 'ended'
      ? '本次活动已结束'
      : topic.phase === 'upcoming'
        ? '记下这一站，活动开始后再出发'
        : pending.length
          ? '满足活动条件，可获得主题印章'
          : '继续留下你的活动足迹';
  const text =
    topic.phase !== 'active'
      ? '请在活动有效时间内完成真实打卡。'
      : stamp
        ? `${stamp.title}${stamp.earned ? ' · 已获得' : ' · ' + stamp.progress + '/' + stamp.target}`
        : '完成地点打卡，推进活动进度。';
  island = document.createElement('aside');
  island.className = 'activity-reward-island';
  island.setAttribute('role', 'status');
  island.innerHTML = `${stamp ? `<img src="${badgeURL(stamp.badgePreset)}" alt="${esc(stamp.title)}印章" class="${stamp.earned ? '' : 'is-locked'}">` : `<span class="activity-reward-symbol">${icon('check')}</span>`}<div><strong>${esc(title)}</strong><small>${esc(text)}</small></div><button type="button" data-no-liquid aria-label="关闭活动奖励提示">${icon('close')}</button>`;
  const frame = document.querySelector('.app-shell')?.getBoundingClientRect();
  if (frame) island.style.left = frame.left + frame.width / 2 + 'px';
  document.body.append(island);
  island.querySelector('button').onclick = dismissActivityReward;
  timeout = setTimeout(dismissActivityReward, 6000);
}
export function installActivityJourney(context) {
  let last = '',
    sequence = 0;
  const enter = async () => {
    const hash = location.hash,
      token = ++sequence;
    if (!hash.startsWith('#place/')) return;
    const params = new URLSearchParams(hash.split('?')[1] || ''),
      id = params.get('activity');
    if (!/^[a-f0-9-]{36}$/.test(id || '') || last === hash || tourIsOpen()) return;
    const account = context().account?.id;
    try {
      const { items } = await api('/api/topics');
      if (token !== sequence || location.hash !== hash || context().account?.id !== account) return;
      const placeId = hash.split('/')[1].split('?')[0],
        topic = items.find((t) => t.id === id && t.points.some((p) => p.id === placeId));
      const target = document.querySelector('.place-bottom-actions a[href^="#checkin/"]');
      if (!topic || !target) return;
      document.querySelectorAll('a[href^="#checkin/"]').forEach((a) => {
        if (!a.getAttribute('href').startsWith('#checkin/' + placeId)) return;
        const [path, query = ''] = a.getAttribute('href').split('?'),
          search = new URLSearchParams(query);
        search.set('activity', id);
        a.href = path + '?' + search;
      });
      last = hash;
      showFeatureTour({
        label: '活动地点指引',
        steps: [
          [
            '.place-bottom-actions a[href^="#checkin/"]',
            'camera',
            '在这一站，留下真实打卡',
            `你正在参加「${topic.title}」。查看地点和拍摄建议，在活动有效时间内完成真实打卡；完成计划或仅打开地点不会点亮印章。`,
          ],
        ],
        done: () => {
          if (location.hash === hash) showActivityReward(topic);
        },
      });
    } catch {
      /* Activity guidance never blocks visiting the place. */
    }
  };
  document.addEventListener('campus:page-ready', () => void enter());
  document.addEventListener('campus:tour-closed', () => void enter());
  window.addEventListener('hashchange', () => {
    ++sequence;
    last = '';
    dismissActivityReward();
  });
}
