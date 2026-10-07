// Only live catalogue content is removed. Personal exploration snapshots stay intact.
const fs = require('node:fs'), path = require('node:path');
const S = require('./security.cjs');
const mediaId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
function photoIds(point) {
  return [...new Set([point.mediaId, point.cover?.match(/^\/media\/([a-f0-9-]+)$/)?.[1]].filter(mediaId))];
}
module.exports = function contentDeletion({db, save, directory}) {
  const mediaRoot = path.resolve(directory, 'media');
  function preview(type, id) {
    if (!['points', 'routes', 'templates'].includes(type) || typeof id !== 'string') S.fail('删除对象无效');
    const item = db[type].find(x => x.id === id);
    if (!item) S.fail('内容不存在或已删除', 404);
    if (type === 'points' ? item.published !== false : type === 'routes' ? item.active !== false : item.approved !== false)
      S.fail('请先下线或暂停内容，再执行永久删除', 409);
    const templates = type === 'points' ? db.templates.filter(t => t.pointId === id) : [];
    const routes = type === 'points' ? db.routes.filter(r => r.points.includes(id)) : [];
    const reports = type === 'points' ? db.reports.filter(r => r.pointId === id) : [];
    const candidates = type === 'points' ? photoIds(item) : [];
    const photos = candidates.map(photo => {
      const pointReferences = db.points.filter(p => !(type === 'points' && p.id === id) && photoIds(p).includes(photo));
      const sessionReferences = db.sessions.filter(s => s.tasks.some(t => t.mediaId === photo));
      const file = path.join(mediaRoot, photo + '.jpg');
      return {id:photo, pointIds:pointReferences.map(p=>p.id), sessionIds:sessionReferences.map(s=>s.id), bytes:fs.existsSync(file)?fs.statSync(file).size:0};
    });
    const removePhotos = photos.filter(p => !p.pointIds.length && !p.sessionIds.length);
    const result = {type,id,name:S.text(item.name || item.title,120), relatedTemplates:templates.length,
      affectedRoutes:routes.length, relatedReports:reports.length, deletedPhotos:removePhotos.length,
      preservedPhotos:photos.length-removePhotos.length, photoBytes:removePhotos.reduce((n,p)=>n+p.bytes,0),
      personalRecordsPreserved:true};
    const fingerprint = S.digest(JSON.stringify({item,templates,routes,reports,photos}));
    return {result,fingerprint,templates,routes,reports,photos,removePhotos};
  }
  function cleanup() {
    const pending = db.pendingMediaDeletes || [];
    if (!pending.length) return;
    const remaining = [];
    for (const entry of pending) {
      if (!mediaId(entry.id)) { remaining.push(entry); continue; }
      const file = path.resolve(mediaRoot, entry.id + '.jpg');
      if (path.dirname(file) !== mediaRoot) { remaining.push(entry); continue; }
      try { fs.unlinkSync(file); }
      catch(e) { if (e.code !== 'ENOENT') { remaining.push(entry); continue; } }
    }
    db.pendingMediaDeletes = remaining;
    for (const event of db.audit.filter(e=>e.action==='永久删除内容')) event.cleanupPending = remaining.filter(p=>p.auditId===event.id).length;
    try { save(); } catch { db.pendingMediaDeletes = pending; }
  }
  function execute(plan, actor, audit) {
    const before = structuredClone(db), {type,id} = plan.result;
    try {
      db[type] = db[type].filter(x => x.id !== id);
      if (type === 'points') {
        db.templates = db.templates.filter(t => t.pointId !== id);
        db.reports = db.reports.filter(r => r.pointId !== id);
        for (const r of plan.routes) { r.points=r.points.filter(p=>p!==id); r.active=false; r.version++; }
        for (const user of db.users) if(user.bookmarks) user.bookmarks=user.bookmarks.filter(p=>p!==id);
        for (const photo of plan.photos) {
          const m=db.media.find(m=>m.id===photo.id);
          if(m && !photo.pointIds.length) m.public=false;
        }
      }
      const removed = new Set(plan.removePhotos.map(p=>p.id));
      db.media = db.media.filter(m=>!removed.has(m.id));
      db.version++;
      const event = audit(actor,'永久删除内容',id,`${plan.result.name}；删除 ${plan.result.deletedPhotos} 张独占照片；保留 ${plan.result.preservedPhotos} 张仍被引用的照片`);
      Object.assign(event,{contentType:type,contentName:plan.result.name,result:'deleted',deletion:plan.result,cleanupPending:removed.size});
      db.pendingMediaDeletes ||= [];
      db.pendingMediaDeletes.push(...plan.removePhotos.map(p=>({id:p.id,auditId:event.id})));
      // Removal and cleanup queue are persisted together before touching photo files.
      save();
    } catch(e) {
      for(const key of Object.keys(db)) delete db[key];
      Object.assign(db,before);
      throw e;
    }
    cleanup();
    return {...plan.result,cleanupPending:(db.pendingMediaDeletes||[]).filter(p=>plan.removePhotos.some(m=>m.id===p.id)).length};
  }
  return {preview,execute,cleanup};
};
