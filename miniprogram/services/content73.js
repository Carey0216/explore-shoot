// Display suggestions only; these do not assert current weather or a verified shooting position.
function shootingLine(point) {
  return (
    {
      建筑: '留意建筑的线条，试着把前景与主体一起收进画面。',
      自然: '找一处自然的前景，给光影和倒影留一点空间。',
      人文: '从一个日常细节开始，记录属于自己的校园视角。',
      运动: '在安全公共区域取景，为活动中的人留出通道。',
    }[point.theme] || '换一个角度，记录今天路过校园时的小发现。'
  );
}

const emptyContent73 = {
  saved: [
    '先收下一张想去拍的照片',
    '下次路过时，就有了一个出发的理由。',
    '去发现一处想拍的地方',
    '#discover',
  ],
  posts: [
    '给熟悉的校园，留下你的视角',
    '一张照片、一句具体建议，也能帮助下一位探索的人。',
    '分享一个校园发现',
    '#publish',
  ],
  reports: [
    '遇到变化，也可以让大家知道',
    '地点关闭、路线变化或资料有误，都可以从地点详情反馈。',
    '查看地点与拍摄提醒',
    '#shots',
  ],
};

module.exports = { shootingLine, emptyContent73 };
