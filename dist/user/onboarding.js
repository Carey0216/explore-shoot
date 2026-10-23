import { icon } from '/shared/ui.js';
import { showFeatureTour } from '/shared/feature-tour.js';
import { onboardingState } from '/shared/onboarding-state.js';
import { showWhatsNew } from './updates.js';
export const onboardingEdition = '7.3';
const version = '7.3.0';
const steps = [
  [
    '#mobile-nav a[href="#discover"]',
    'discover',
    '在社区发现校园',
    '先看照片与一句拍摄建议，再进入地点详情。发现和机位仍在顶部居中切换，主图下方还有更多校园角落。',
  ],
  [
    '#mobile-nav .dock-create',
    'camera',
    '从这里发布新发现',
    '中央的＋用于发布照片与文字；编辑中途退出也会保留本机草稿。',
  ],
  [
    '#mobile-nav a[href="#map"]',
    'map',
    '地图、导航与探索',
    '在出行内切换地图、导航和探索，点选地点后可以接着规划路线。',
  ],
  [
    '#account-open, #login-open',
    'user',
    '账号入口在这里',
    '点按头像，或在电脑上移入头像，可查看账号、编辑资料和退出登录。',
  ],
  [
    '#topbar .message-link',
    'message',
    '消息不会错过',
    '审核结果、活动提醒和管理员对话，都从这里查看。',
  ],
  [
    '#mobile-nav a[href="#me"]',
    'book',
    '拍摄指南和短途安排',
    '在我的「更多工具与帮助」重看引导；拍摄指南提供新生、课间、饭后和周末安排。地点内照片可就地放大，关闭预览后回到原处。',
  ],
  [
    '#mobile-nav a[href="#me"]',
    'camera',
    '把想去的地方排成计划',
    '拍摄清单可以拖动或上下排序，设置出发时间，检查开放时段冲突，并勾选电量、天气等出发前清单。确认后再保存。',
  ],
  [
    '#mobile-nav a[href="#me"]',
    'heart',
    '收藏、护照和自己的作品',
    '我的先展示护照和最近探索，接着是常用工具。灰色印章尚未获得；私人手记、轨迹与照片不会自动公开。',
  ],
  [
    '#mobile-nav a[href="#topics"]',
    'clock',
    '看看校园正在发生什么',
    '活动详情显示真实打卡进度、下一站与主题印章。点击下一站查看拍摄提示；完成清单不会代替真实打卡。',
  ],
  [
    '.support-orb',
    'camera',
    '把想法变成一次拍摄',
    '助手可以预览拍摄计划；确认后才会加入清单。我的「更多工具与帮助」随时可以重看引导。',
  ],
];
let pending = null;
export const onboardingEntry = () =>
  `<section class="onboarding-entry"><span>${icon('discover')}</span><div><strong>功能引导与更新</strong><small>认识各项功能，查看版本变化</small></div><button data-no-liquid data-onboarding aria-label="重新认识各项功能">查看 ${icon('arrow')}</button><a href="#updates" class="onboarding-update-link">查看已发布更新 ↗</a></section>`;
export function bindOnboardingEntry(account) {
  document
    .querySelectorAll('[data-onboarding]')
    .forEach((b) => (b.onclick = () => showOnboarding(account, true)));
}
export function showOnboarding(account = null, force = false) {
  if (!force && /^#place\/[a-z0-9-]+\?shared=1(?:&|$)/i.test(location.hash)) return;
  if (document.documentElement.classList.contains('viewport-blocked')) {
    pending = { account, force };
    return;
  }
  const history = onboardingState('user', account);
  if (!force && history.experienced()) {
    void showWhatsNew(account);
    return;
  }
  showFeatureTour({ steps, done: () => history.finish(version) });
}
window.addEventListener('viewport:mode', (e) => {
  if (!e.detail?.blocked && pending) {
    const task = pending;
    pending = null;
    showOnboarding(task.account, task.force);
  }
});
