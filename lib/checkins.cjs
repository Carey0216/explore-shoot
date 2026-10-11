// Private place visits are independent of multi-stop exploration sessions.
const S = require('./security.cjs');
function distance(a,b) {
  const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2)));
}
function create(db, owner, body, now=Date.now()) {
  if(body.accountId&&body.accountId!==owner.id)S.fail('登录账号已改变，请重新打开打卡页面',403);
  if(body.note!==undefined&&typeof body.note!=='string')S.fail('打卡感受格式无效');
  if(typeof body.submissionId!=='string'||!/^[a-f0-9-]{36}$/.test(body.submissionId))S.fail('提交编号无效，请重新打开打卡页面');
  const old=(db.checkins||[]).find(c=>c.ownerId===owner.id&&c.submissionId===body.submissionId);
  if(old)return {record:old,repeated:true};
  const point=db.points.find(p=>p.id===body.pointId&&p.published&&p.open);
  if(!point)S.fail('点位已关闭或下线，暂不能新增打卡',409);
  const note=S.text(body.note,1000);
  if(typeof body.note==='string'&&body.note.trim().length>1000)S.fail('感受请控制在 1000 字以内');
  const media=body.mediaId?db.media.find(m=>m.id===body.mediaId&&m.ownerId===owner.id&&!m.deleted&&!m.public):null;
  if(body.mediaId&&!media)S.fail('请使用自己上传的私人照片',403);
  if(!note&&!media)S.fail('留一张照片或写一点感受，再收下这次打卡');
  const guide=body.templateId?db.templates.find(t=>t.id===body.templateId&&t.pointId===point.id&&t.approved):null;
  if(body.templateId&&!guide)S.fail('拍摄建议已更新，请重新选择',409);
  let location=null;
  if(body.location){
    const p=body.location;
    if(![p.lng,p.lat,p.accuracy,p.at].every(Number.isFinite)||Math.abs(p.lng)>180||Math.abs(p.lat)>90||p.accuracy<0||p.accuracy>80||now-p.at>30000||p.at>now+1000)S.fail('定位已过期或精度不足，请重新定位或不使用定位');
    const meters=Math.round(distance(p,point));
    location={distance:meters,accuracy:Math.round(p.accuracy),nearby:meters<=150};
  }
  // No precise coordinates are retained in a check-in; location is a browser report, not anti-cheat verification.
  const record={id:S.id(),ownerId:owner.id,submissionId:body.submissionId,pointId:point.id,pointName:point.name,theme:point.theme,templateId:guide?.id||null,shotTitle:guide?.title||'',note,mediaId:media?.id||null,location,createdAt:new Date(now).toISOString()};
  return {record,repeated:false};
}
module.exports={create,distance};
