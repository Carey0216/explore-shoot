// Navigate to and spotlight the real feature instead of explaining it over the updates page.
const steps = [
  [
    'discover',
    '#community-header',
    'community',
    '发现你的校园',
    '在“推荐”看照片与拍摄建议。想找具体的楼宇或地点时，切换顶部“找地点”进行搜索和筛选。',
  ],
  [
    'shots',
    '.search',
    'camera',
    '找到想拍的那一站',
    '搜索楼名、别称或想拍的内容，再按分类筛选。点开地点后，查看具体拍摄站位与取景建议，也能收藏、导航和拍照打卡。',
  ],
  [
    'topics',
    '.page',
    'calendar',
    '活动与主题',
    '打开活动查看地点与完成条件。真实打卡后才会计入进度。',
  ],
  [
    'map',
    '.map-tabs821',
    'map',
    '带着路线出发',
    '先选目的地，再点规划路线；立体地图、影像和全景放在地图下面。',
  ],
  [
    'my',
    '.passport-preview73',
    'passport',
    '把校园收进护照',
    '每次真实打卡都会留下记录。点开校园收集图，查看已点亮的建筑和下一站。',
  ],
  [
    'my',
    '.personal-toolbox73',
    'settings',
    '常用工具都在这里',
    '拍摄清单、私人回忆、联系管理员和设置，都能从这组带图标的入口找到。',
  ],
  [
    'my',
    '.my-content-tabs',
    'heart',
    '切换你的内容',
    '默认选中收藏。点社区发现管理自己发布的地点，点问题反馈查看处理进度。',
  ],
  [
    'my',
    '.my-heading',
    'assistant',
    '随时继续探索',
    '右下角校园助手可以帮你找地点、安排和修改拍摄计划。需要时再来我的重新查看引导。',
  ],
];
let task;
const owner = () =>
  require('./network').configuredOrigin() +
  ':' +
  (require('./api').session()?.account.id || 'guest');
function active() {
  return !!task && task.owner === owner();
}
function start(key) {
  task = { index: 0, owner: owner(), key };
  go();
}
function go() {
  if (!active()) return;
  const route = 'pages/' + steps[task.index][0] + '/index',
    page = getCurrentPages().slice(-1)[0];
  if (page?.route === route) consume(page);
  else
    wx.switchTab({
      url: '/' + route,
      fail() {
        task = null;
      },
    });
}
function move(delta) {
  if (!active()) return;
  task.index += delta;
  if (task.index >= steps.length) return dismiss();
  task.index = Math.max(0, task.index);
  go();
}
function dismiss() {
  if (task?.key) wx.setStorageSync(task.key, true);
  task = null;
  getCurrentPages().slice(-1)[0]?.selectComponent?.('#experience')?.finishFeatureTour821?.();
}
function clear() {
  task = null;
}
function consume(page) {
  if (!active() || page.route !== 'pages/' + steps[task.index][0] + '/index') return;
  const index = task.index,
    scope = task.owner;
  const show = () => {
    if (!active() || task.index !== index || task.owner !== scope || !page.nativeVisible) return;
    const layer = page.selectComponent?.('#experience');
    if (layer) {
      const step = [...steps[index]];
      if (page.route === 'pages/my/index' && !require('./api').session()) step[1] = '.my-heading';
      layer.showFeatureTour821(step, index, steps.length);
    }
  };
  wx.nextTick(show);
}
module.exports = { start, move, dismiss, clear, consume, active };
