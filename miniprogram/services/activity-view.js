const { pointView } = require('./model');
const themes = {
  spring: '春日校园',
  graduation: '毕业季',
  autumn: '秋色',
  night: '夜景',
  other: '校园活动',
};
function activityView(t, points = []) {
  const point = t.points.map((p) => points.find((x) => x.id === p.id)).find((p) => p && p.cover);
  return {
    ...t,
    next:
      t.phase === 'active'
        ? t.points.find((p) => !(t.visitedPointIds || []).includes(p.id)) || null
        : null,
    progress: t.points.length
      ? Math.min(
          100,
          Math.round(
            (t.points.filter((p) => (t.visitedPointIds || []).includes(p.id)).length /
              t.points.length) *
              100,
          ),
        )
      : 0,
    complete:
      t.points.length > 0 && t.points.every((p) => (t.visitedPointIds || []).includes(p.id)),
    themeText: themes[t.theme] || themes.other,
    phaseText: { active: '正在进行', upcoming: '即将开始', ended: '已结束' }[t.phase],
    time:
      new Date(t.startsAt).toLocaleDateString() + ' — ' + new Date(t.endsAt).toLocaleDateString(),
    photo: point ? pointView(point).photo : '/shared/nmu-campus.jpg',
    credit: point ? '关联地点配图' : '校园参考配图',
  };
}
module.exports = { activityView };
