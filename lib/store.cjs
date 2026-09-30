const fs = require('node:fs'), path = require('node:path');
const { id, hashPassword } = require('./security.cjs');
const campus = require('./campus.cjs');
module.exports = function openStore(initialPassword) {
  const directory = process.env.EXPLORE_DATA_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'store-v2.json');
  let db;
  if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    let bootstrapHash = null;
    const bootstrapFile = path.join(directory, 'bootstrap-admin.json');
    if (fs.existsSync(bootstrapFile)) bootstrapHash = JSON.parse(fs.readFileSync(bootstrapFile, 'utf8')).passwordHash;
    db = { schema: 2, version: 1, ...campus.seed(), users: [], admins: [{ id: id(), username: 'admin', name: '超级管理员', role: 'super', enabled: true, passwordHash: bootstrapHash || hashPassword(initialPassword), createdAt: new Date().toISOString() }], invites: [], applications: [], reports: [], sessions: [], auth: [], media: [], audit: [], logs: [], settings: { amapKey: '', amapSecurity: '', mapProvider: 'osm' } };
    const oldFile = path.join(directory, 'store.json');
    if (fs.existsSync(oldFile)) {
      const old = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
      db.legacyArchive = { importedAt: new Date().toISOString(), pointCount: old.points.length, sessionCount: old.sessions.length, source: 'store.json', note: '旧版虚构数据和匿名记录保留在原文件，不作为真实校园推荐。' };
    }
  }
  if (!db.contentVersion) {
    const missions = [
      ['给图书馆找一个画框', ['站在开放的公共区域，找一个门框、树枝或栏杆作前景。','把图书馆放进这个自然画框，试着留出一些天空。','再去掉前景拍一张，对比哪种构图更有层次。']],
      ['把重复线条拍出节奏', ['在允许拍摄的公共位置，观察楼体中重复出现的线条。','选择其中一组，尝试正面或斜侧面的构图。','换一个距离，收集一张远景和一张局部。']],
      ['收集一个几何形状', ['看看这处建筑，找一个圆、三角形或矩形。','让这个形状成为画面主体，尝试简洁的背景。','改变手机高度，对比两张画面的留白。']],
      ['给运动空间留一抹颜色', ['在不影响活动的安全位置，选择一个静物或建筑局部。','寻找其中最醒目的一种颜色，把它放在画面中心。','再拍一张环境远景，看看颜色如何融入整个空间。']],
      ['让线条带你进入画面', ['从公共区域观察跑道、看台或道路的线条。','选一条线，让它从画面边缘延伸向一个静物主体。','在安全位置降低手机高度，看看视角怎样变化。']],
      ['拍一张有留白的球场', ['在不影响他人活动的位置，观察球场线条与天空。','选择一小段线条作主体，给天空留出更多空间。','试试横向与竖向构图，不拍摄未经同意的人物特写。']],
      ['记录一个校园入口', ['从校内允许停留的公共区域观察入口空间。','选择入口标识或建筑局部，避开私人证件与人物特写。','用一张远景和一张细节记录你对入口的印象。']],
      ['把校园日常装进照片', ['站在允许通行的公共区域，选择餐厅外部的一个静物。','为画面寻找一点有趣的色彩或重复图案。','试着用一张环境照片表现日常，避免拍到他人的私人信息。']]
    ];
    missions.forEach(([title,steps],i)=>{const t=db.templates.find(x=>x.id==='nt'+(i*2+1));if(t&&t.version===1){t.title=title;t.steps=steps;t.version++;}});
    db.contentVersion=1;db.version++;
  }
  function save() {
    fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(file + '.tmp', file);
  }
  function audit(actor, action, subject, detail = '') {
    db.audit.push({ id: id(), at: new Date().toISOString(), actorId: actor.id, actor: actor.username, action, subject, detail });
    if (db.audit.length > 3000) db.audit.splice(0, db.audit.length - 3000);
  }
  save();
  return { db, save, audit, directory };
};
