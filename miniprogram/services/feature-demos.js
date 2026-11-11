// These are illustrations of actions. Playing a demo never clicks the real controls.
const demos = {
  publish: [
    '#publish-add-photo',
    '.photo-grid',
    'camera',
    '发布一个校园发现',
    'Publish a discovery',
    ['相册多选', '标记地点', '预览并发布'],
    ['Select photos', 'Mark the place', 'Preview and publish'],
    '一次最多可选九张照片。在地图标记位置，检查照片与文字后再发布。',
    'Select up to nine photos at once. Mark the place, then review the photos and description before publishing.',
  ],
  checkin: [
    '#checkin-photo',
    '.checkin-photo821',
    'camera',
    '从打卡到点亮建筑',
    'From check-in to first light',
    ['拍照或写感受', '保存私人打卡', '观看建筑落位'],
    ['Add a photo or note', 'Save private check-in', 'Watch the building land'],
    '拍一张照片或写一段感受。关联地点打卡成功后，收集图会展示建筑落位。',
    'Add a photo or a note. A successful check-in at a linked place lights up its building.',
  ],
  passport: [
    '#passport-atlas',
    '#atlas',
    'passport',
    '接着点亮下一栋',
    'Light up the next building',
    ['选一栋楼', '查看关联地点', '规划路线'],
    ['Select a building', 'See the linked place', 'Plan a route'],
    '浅蓝色表示选中，金色表示已点亮。选择未点亮建筑，查看关联地点与打卡入口。',
    'Blue marks your selection and gold marks a lit building. Select an unlit building to see how to check in.',
  ],
  plans: [
    '.plan-heading',
    '.page .title',
    'calendar',
    '带着拍摄清单出发',
    'Set out with a shoot plan',
    ['加入地点或机位', '检查下一站', '开始导航'],
    ['Add a place or spot', 'Check the next stop', 'Start navigation'],
    '保存后看下一站和开放信息。遇到关闭或下线的站点，可以替换。',
    'After saving, check the next stop and access information. Replace a stop if it becomes unavailable.',
  ],
  map: [
    '.outing-tabs a[href="#navigate"]',
    '#map-nav-tab',
    'map',
    '在景遇规划步行路线',
    'Plan a walk in Jingyu',
    ['选择目的地', '规划路线', '开始导航'],
    ['Pick a destination', 'Plan the route', 'Start navigation'],
    '规划成功后可以选站内导航或打开微信导航。点地图右下角的定位按钮可回到当前位置。',
    'After planning, choose in-app navigation or WeChat navigation. The location button brings the map back to you.',
  ],
  'map-3d': [
    '.map-dimension-toggle',
    '.map-mode',
    'map',
    '从总览看校园楼栋',
    'Explore campus in 3D',
    ['地图右上角点 3D', '看校园总览', '点 2D 返回'],
    ['Tap 3D', 'View the campus', 'Tap 2D to return'],
    '点地图右上角的 3D，进入校园总览即可看到已启用的补绘楼栋。',
    'Tap 3D in the top right to see supplemental buildings in the campus overview.',
  ],
  'share-art': [
    '[data-share-art]',
    '#art-editor',
    'share',
    '把分享图片做成自己的样子',
    'Make the artwork yours',
    ['打开分享图片', '涂画或贴图', '保存成品'],
    ['Open the artwork', 'Draw or add stickers', 'Save the result'],
    '打开地点海报、护照卡或回忆长图，选画笔和贴图。网页二维码和小程序码始终显示在最上层。',
    'Open a place poster, passport card, or memory image. Draw or add stickers while the web and WeChat codes stay on top.',
  ],
  'building-editor': [
    '[data-building-new]',
    '',
    'map',
    '维护地图补绘楼栋',
    'Edit campus buildings',
    ['新建或选楼栋', '调整轮廓与位置', '预览并保存'],
    ['Choose or add a building', 'Adjust the footprint', 'Preview and save'],
    '在校园地图打开补绘楼栋，精调长宽、高度、旋转和位置。启用补绘并保存后，双端地图会读取更新。',
    'Open supplemental buildings in Campus Map. Adjust the outline, position, and height. Enable the building and save to update both apps.',
  ],
};

function featureDemo(page, english = false) {
  const demo = demos[page];
  if (!demo) return null;
  const [web, mini, icon, title, titleEn, actions, actionsEn, copy, copyEn] = demo;
  return {
    web,
    mini,
    icon,
    title: english ? titleEn : title,
    actions: english ? actionsEn : actions,
    copy: english ? copyEn : copy,
  };
}

const releaseGuideVersion = '8.3.0';
function releaseFeatureDemos(version, english = false) {
  if (String(version).replace(/^v/, '') !== releaseGuideVersion) return [];
  return ['map', 'map-3d', 'share-art', 'publish', 'checkin', 'passport', 'plans'].map((page) =>
    featureDemo(page, english),
  );
}

module.exports = { featureDemo, releaseGuideVersion, releaseFeatureDemos };
