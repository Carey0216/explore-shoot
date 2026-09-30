const data = require('../reference/campus-pois.json');
const { fail } = require('./security.cjs');
function inside(lng, lat) {
  // A 25m tolerance permits mapped entrance points on the campus boundary.
  const xs = data.boundary.map(p => p[0]), ys = data.boundary.map(p => p[1]);
  if (lng < Math.min(...xs) - .00025 || lng > Math.max(...xs) + .00025 || lat < Math.min(...ys) - .00025 || lat > Math.max(...ys) + .00025) return false;
  let included = false;
  for (let i = 0, j = data.boundary.length - 1; i < data.boundary.length; j = i++) {
    const a = data.boundary[i], b = data.boundary[j];
    if ((a[1] > lat) !== (b[1] > lat) && lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) included = !included;
    const t = Math.max(0, Math.min(1, ((lng-a[0])*(b[0]-a[0]) + (lat-a[1])*(b[1]-a[1])) / ((b[0]-a[0])**2 + (b[1]-a[1])**2)));
    if (Math.hypot(lng-a[0]-t*(b[0]-a[0]), lat-a[1]-t*(b[1]-a[1])) <= .00025) return true;
  }
  return included;
}
function coordinate(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !inside(lng, lat)) fail('请选择北方民族大学校区范围内的点位');
  return { lng, lat };
}
const descriptions = [
  ['建筑', '图书馆的建筑线条，适合观察远景与局部的不同构图。', '在室外公共步道拍摄，不进入限行区域。'],
  ['建筑', '从公共区域观察楼体立面与转角，寻找有节奏的线条。', '避开教学人流，不拍摄教室内的人员。'],
  ['建筑', '用相同位置的远景与特写，记录建筑里的几何关系。', '在公共步道拍摄，具体开放情况以现场为准。'],
  ['运动', '收集运动场所周边的色彩与空间，记录校园的活力。', '不进入正在使用的场地，不拍摄可识别的人脸。'],
  ['运动', '观察看台与跑道形成的线条，尝试一个低机位构图。', '拍摄前观察活动安排，避免妨碍正在运动的人。'],
  ['运动', '把球场线条与天空放在同一画面里，寻找简单的构图。', '勿进入比赛区域，开放状态以现场为准。'],
  ['人文', '从校内安全位置记录入口与日常来往的空间关系。', '不进入车道，不阻挡出入口，不拍摄可识别路人。'],
  ['人文', '记录建筑外部与校园生活的空间，试试一张环境照片。', '仅拍摄室外环境，不影响就餐通行。']
];
function seed() {
  const points = data.pois.map((p, index) => ({ id: `nmu${index + 1}`, ...p, theme: descriptions[index][0], description: descriptions[index][1], condition: descriptions[index][2], fact: `OpenStreetMap 公开资料标注该地点为“${p.name}”。`, allowed: '仅在公共区域观察和拍摄静物', open: true, published: true, trust: 'reference', verifiedAt: null, version: 1, cover: null, authorId: null, authorName: '校园地图资料', createdAt: new Date().toISOString() }));
  const routes = [
    { id: 'nroute1', name: '建筑线条收集', subtitle: '从图书馆到教学楼，试着把日常看成一组几何。', points: ['nmu1', 'nmu3', 'nmu2'], theme: '建筑', walk: 6, distance: 450, intensity: '轻松', active: true, timings: [], version: 1, measured: false },
    { id: 'nroute2', name: '校园的运动时刻', subtitle: '沿着运动场地走一段，发现跑道、看台和天空。', points: ['nmu6', 'nmu5', 'nmu4'], theme: '运动', walk: 10, distance: 780, intensity: '适中', active: true, timings: [], version: 1, measured: false },
    { id: 'nroute3', name: '从北苑慢慢出发', subtitle: '经过体育馆，走向图书馆，收集校园生活的不同侧面。', points: ['nmu8', 'nmu4', 'nmu5', 'nmu1'], theme: '人文', walk: 13, distance: 1000, intensity: '适中', active: true, timings: [], version: 1, measured: false }
  ];
  const templates = points.flatMap((p, i) => [
    { id: `nt${i*2+1}`, pointId: p.id, title: p.theme === '建筑' ? '把线条装进画面' : '给日常换个机位', steps: ['在允许的室外公共区域停下，选择一个静物主体。', '用手机拍下一张环境远景，再拍一张局部细节。', '对比两个视角，选一张你更喜欢的照片。'], duo: '两人各选一个构图，交换手机说说自己的发现。', minutes: 2, approved: true, version: 1 },
    { id: `nt${i*2+2}`, pointId: p.id, title: '试试更低一点的视角', steps: ['选择安全、不影响通行的站立位置。', '调整手机高度，用一个静物主体构成前景。', '观察留白，拍下你觉得最有趣的一张。'], duo: '两人在同一位置选择不同手机高度，对比构图。', minutes: 2, approved: true, version: 1 }
  ]);
  return { points, routes, templates };
}
module.exports = { ...data, inside, coordinate, seed, info: { name: '北方民族大学', address: '宁夏银川市西夏区文昌北街204号', center: [106.1000, 38.4968], boundary: data.boundary, source: 'https://www.openstreetmap.org/way/461608579', coordinateSystem: 'WGS84', notice: '公开地图资料，具体开放和拍摄条件以现场为准。' } };
