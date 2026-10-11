const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const S = require('./lib/security.cjs'), campus = require('./lib/campus.cjs');
const Preferences = require('./lib/preferences.cjs');
const { db, save, audit: storeAudit, directory } = require('./lib/store.cjs')(process.env.ADMIN_PASSWORD || 'Explore2026!');
const deletion = require('./lib/content-deletion.cjs')({db,save,directory});
const navigationVoice = require('./lib/navigation-voice.cjs')(__dirname);
const translation = require('./lib/translation.cjs')(__dirname);
const mapSettings = require('./lib/map-settings.cjs')({db,save});
const publicMap = require('./lib/map-settings.cjs').publicMap;
const Popularity=require('./lib/point-popularity.cjs'),pointViews=Popularity.counter();
process.on('exit',()=>translation.close());
process.on('exit',()=>navigationVoice.close());
const deleteVerifications = new Map(), deleteIntents = new Map();
deletion.cleanup();
setInterval(()=>deletion.cleanup(),30000).unref();
const ports = { user: Number(process.env.PORT || 4174), admin: Number(process.env.ADMIN_PORT || 4176) };
const mediaDir = path.join(directory, 'media'); fs.mkdirSync(mediaDir, { recursive: true });
const avatarDir = path.join(directory, 'avatars'); fs.mkdirSync(avatarDir, { recursive: true });
const hosts = { user: ['explore.localhost', '127.0.0.1'], admin: ['admin.localhost', 'localhost', '127.0.0.1'] };
const types = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.geojson':'application/geo+json; charset=utf-8','.txt':'text/plain; charset=utf-8' };
const limits = new Map();
function limited(key, max = 12) { let e = limits.get(key); if (!e || e.until < Date.now()) { e = { count:0, until:Date.now()+60000 }; limits.set(key,e); } if (++e.count > max) S.fail('操作过于频繁，请一分钟后再试',429); }
function safeAccount(a) { if (!a) return null; const { passwordHash, ...rest } = a; return {...rest,preferences:Preferences.normalize(a.preferences),preferencesRevision:a.preferencesRevision||0}; }
function auditView(event){return event.subject==='map'&&event.action!=='验证地图配置权限'?{...event,detail:'配置详情已隐藏'+(event.detail?.match(/验证者 ID .+$/)?.[0]?' · '+event.detail.match(/验证者 ID .+$/)[0]:'')}:event;}
function elapsed(s) { return s.elapsed + (s.status === 'active' ? Date.now()-s.lastResume : 0); }
function visible(p) { return p.published && p.open; }
function sessionView(s) { const blocked = s.tasks.filter(t => t.status === 'pending' && !db.points.some(p => p.id===t.pointId && visible(p))).map(t=>t.pointName); if (!db.routes.some(r=>r.id===s.routeId&&r.active) && s.tasks.some(t=>t.status==='pending')) blocked.push('路线已停用'); return {...s,blocked}; }
function prefs(p) { if(!p||![15,20,30].includes(p.budget)||![1,2].includes(p.people)||!['轻松','适中'].includes(p.intensity)||!['全部','建筑','自然','人文','运动'].includes(p.theme)||!['guide','fixed','personal'].includes(p.mode))S.fail('探索偏好无效');return {budget:p.budget,people:p.people,intensity:p.intensity,theme:p.theme,mode:p.mode}; }
function plan(r,p) { const walk=r.walk,stay=r.points.length*2,buffer=Math.ceil(p.budget*.2),total=walk+stay+buffer;const reason=!r.active?'路线已停用':r.points.some(id=>!db.points.some(x=>x.id===id&&visible(x)))?'部分点位已下线或关闭':!r.points.every(id=>db.templates.some(t=>t.pointId===id&&t.approved))?'拍摄任务等待审核':p.intensity==='轻松'&&r.intensity!=='轻松'?'请切换为适中步行':total>p.budget?`预计 ${total} 分钟，请增加预算`:'';return {...r,walk,stay,buffer,total,available:!reason,reason,match:p.theme==='全部'||p.theme===r.theme}; }
function loginSession(res,audience,a) { const token=crypto.randomBytes(32).toString('hex');db.auth=db.auth.filter(s=>s.expires>Date.now());db.auth.push({hash:S.digest(token),audience,accountId:a.id,expires:Date.now()+7*86400000});res.setHeader('Set-Cookie',`nmu_${audience}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);save(); }
function authSession(req,audience) { const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split('=')));const value=cookies[`nmu_${audience}`];if(!value||!/^[a-f0-9]{64}$/.test(value))return null;return db.auth.find(t=>t.audience===audience&&t.hash===S.digest(value)&&t.expires>Date.now())||null; }
function auth(req,audience) { const t=authSession(req,audience);return t&&db[audience==='user'?'users':'admins'].find(a=>a.id===t.accountId&&a.enabled&&!a.deleted)||null; }
function ownedMedia(id,a) { const m=db.media.find(m=>m.id===id&&!m.deleted&&m.ownerId===a.id);if(!m)S.fail('照片不存在或不属于当前账号');return m; }
function purgeMedia(id) { if(db.sessions.some(s=>s.tasks.some(t=>t.mediaId===id))||(db.checkins||[]).some(c=>c.mediaId===id))return;const m=db.media.find(m=>m.id===id);if(m&&!m.public){m.deleted=true;const f=path.join(mediaDir,m.id+'.jpg');if(fs.existsSync(f))fs.unlinkSync(f);} }
async function bodyOf(req) { if(!['POST','PATCH','PUT'].includes(req.method))return {};if(!(req.headers['content-type']||'').startsWith('application/json'))S.fail('请使用 JSON 请求',415);let length=0,chunks=[];for await(const c of req){length+=c.length;if(length>8*1024*1024)S.fail('上传内容过大',413);chunks.push(c);}try{const b=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!b||Array.isArray(b)||typeof b!=='object')S.fail('请求格式无效');return b;}catch{S.fail('请求格式无效');} }
function exportHTML(s) { return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${S.escape(s.routeName)} · 探索手记</title><style>body{font:16px/1.9 system-ui;max-width:800px;margin:48px auto;padding:24px;color:#222}img{max-width:100%;border-radius:16px}article{border-bottom:1px solid #eee;padding:24px 0}small{color:#777}</style><h1>${S.escape(s.routeName)}</h1><p>北方民族大学 · ${s.createdAt.slice(0,10)} · ${s.preferences.people} 人探索</p><small>${S.escape(s.generation)} · 手动自报完成</small>${s.tasks.map(t=>{const m=db.media.find(m=>m.id===t.mediaId&&!m.deleted&&m.ownerId===s.ownerId);const f=m&&path.join(mediaDir,m.id+'.jpg');const image=f&&fs.existsSync(f)?'data:image/jpeg;base64,'+fs.readFileSync(f).toString('base64'):null;return `<article><h2>${S.escape(t.pointName)}</h2><p>${S.escape(t.title)}</p><p>${t.status==='done'?'已完成':t.status==='skipped'?'已跳过：'+S.escape(t.reason):'未完成'}</p>${image?`<img alt="${S.escape(t.title)}" src="${image}">`:''}</article>`;}).join('')}<h2>这一刻的感受</h2><p>${S.escape(s.feedback||'还没有填写').replace(/\n/g,'<br>')}</p><small>已记录 ${s.track.length} 个轨迹点，导出不包含精确位置。</small></html>`; }
function handler(audience) { return async(req,res)=>{
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try {
  const host=(req.headers.host||'').split(':')[0];if(!hosts[audience].includes(host))S.fail('此域名不提供该端服务',403);
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)S.fail('请求来源不允许',403);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy',audience==='user'?'camera=(self), geolocation=(self), microphone=()':'camera=(), geolocation=(), microphone=()');
  const url=new URL(req.url,'http://'+req.headers.host),r=url.pathname,b=await bodyOf(req),a=auth(req,audience);
  const ip=req.socket.remoteAddress || 'unknown';
  const audit=(actor,action,subject,detail='')=>storeAudit(actor,action,subject,detail,{ip,audience,actorName:actor.name||actor.nickname||actor.username,actorRole:audience==='admin'?actor.role:'user'});
  const need=()=>{if(!a)S.fail('请先登录',401);return a;},superOnly=()=>{need();if(a.role!=='super')S.fail('仅超级管理员可以管理管理员账号',403);};
  if(audience==='user'&&r==='/api/translation'&&req.method==='POST'){
   limited(ip+':translation',40);if(!['zh-CN','zh-TW','ja','en'].includes(b.target))S.fail('翻译参数无效');
   let content;
   if(Array.isArray(b.texts)){if(Object.keys(b).some(k=>!['texts','target'].includes(k)))S.fail('翻译参数无效');content=b.texts;}
   else{if(Object.keys(b).some(k=>!['pointId','target'].includes(k))||typeof b.pointId!=='string')S.fail('翻译参数无效');const point=db.points.find(p=>p.id===b.pointId&&p.published&&p.authorId);if(!point)S.fail('此社区内容暂不可翻译',404);content=point.description;}
   const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
   try{const result=await translation.translate(content,b.target,{signal:controller.signal});content=null;if(!res.destroyed)return send(result);}catch(error){content=null;if(error.name==='AbortError'||res.destroyed)return;throw error;}return;
  }
  if(r==='/api/health')return send({ok:true,app:'explore-shoot',version:2,release:require('./package.json').version,audience});
  if(audience==='user'&&r==='/api/navigation/voices'&&req.method==='GET')return send(navigationVoice.options());
  if(audience==='user'&&r==='/api/navigation/speech'&&req.method==='POST'){
   limited(ip+':navigation-speech',40);const wav=await navigationVoice.synthesize(b,{background:b.prefetch===true});
   res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':wav.length,'Cache-Control':'no-store'});return res.end(wav);
  }
  if(r==='/api/auth/me')return send({account:safeAccount(a),audience});
  if(r==='/api/auth/preferences'&&req.method==='GET'){need();return send({preferences:Preferences.normalize(a.preferences),revision:a.preferencesRevision||0});}
  if(r==='/api/auth/preferences'&&req.method==='PATCH'){
   need();limited(a.id+':preferences',60);let patch;try{patch=Preferences.validate(b);}catch(e){S.fail(e.message);}
   const previous=a.preferences,revision=a.preferencesRevision,oldAudit=[...db.audit];
   a.preferences={...Preferences.normalize(previous),...patch};a.preferencesRevision=(revision||0)+1;
   try{audit(a,'修改自己的设置',a.id,Object.keys(patch).join('、'));save();}catch(e){a.preferences=previous;a.preferencesRevision=revision;db.audit=oldAudit;throw e;}
   return send({preferences:a.preferences,revision:a.preferencesRevision});
  }
  if(r==='/api/auth/profile'&&req.method==='PATCH'){
   need();limited(a.id+':profile',10);
   if(!Object.keys(b).length||Object.keys(b).some(k=>!['nickname','avatar'].includes(k)))S.fail('只能修改自己的昵称和头像');
   const key=audience==='admin'?'name':'nickname',limit=audience==='admin'?30:24;
   const nickname=Object.hasOwn(b,'nickname')&&typeof b.nickname==='string'?b.nickname.trim():a[key];
   if(Object.hasOwn(b,'nickname')&&(typeof b.nickname!=='string'||!nickname||Array.from(nickname).length>limit||/[\u0000-\u001f\u007f]/.test(nickname)))S.fail(`昵称需要为 1—${limit} 个字`);
   let image;
   if(Object.hasOwn(b,'avatar')&&b.avatar!==null){
    if(typeof b.avatar!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.avatar))S.fail('头像需要为 JPEG 图片');
    const buffer=Buffer.from(b.avatar.split(',')[1],'base64');if(buffer.length>1024*1024)S.fail('处理后头像请小于 1MB');image=S.cleanJPEG(buffer);
   }
   const file=path.join(avatarDir,audience+'-'+a.id+'.jpg');
   if(image){const temporary=file+'.tmp';fs.writeFileSync(temporary,image);fs.renameSync(temporary,file);}
   else if(b.avatar===null&&fs.existsSync(file))fs.unlinkSync(file);
   if(Object.hasOwn(b,'avatar')){a.hasAvatar=!!image;a.avatarVersion=(a.avatarVersion||0)+1;}
   if(a[key]!==nickname&&audience==='user'){for(const p of db.points)if(p.authorId===a.id)p.authorName=nickname;db.version++;}
   a[key]=nickname;audit(a,'修改自己的资料',a.id);save();return send({account:safeAccount(a)});
  }
  if(r==='/api/auth/avatar'&&req.method==='GET'){
   need();const file=path.join(avatarDir,audience+'-'+a.id+'.jpg');if(!a.hasAvatar||!fs.existsSync(file))S.fail('头像不存在',404);
   res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'});return fs.createReadStream(file).pipe(res);
  }
  if(r==='/api/auth/login'&&req.method==='POST'){limited(audience+':login:'+req.socket.remoteAddress);const name=S.text(b.username,32).toLowerCase(),u=db[audience==='user'?'users':'admins'].find(u=>u.username===name&&!u.deleted);if(!u||!S.verifyPassword(String(b.password||'').slice(0,129),u.passwordHash))S.fail('账号或密码不正确',401);if(!u.enabled)S.fail('此账号已停用，请联系管理员',403);loginSession(res,audience,u);return send({account:safeAccount(u)});}
  if(r==='/api/auth/logout'&&req.method==='POST'){const c=(req.headers.cookie||'').split(';').find(c=>c.trim().startsWith(`nmu_${audience}=`));if(c)db.auth=db.auth.filter(s=>s.hash!==S.digest(c.trim().split('=')[1]));res.setHeader('Set-Cookie',`nmu_${audience}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);save();return send({ok:true});}
  if(r==='/api/auth/password'&&req.method==='PATCH'){need();limited(a.id+':password',5);if(!S.verifyPassword(String(b.currentPassword||''),a.passwordHash))S.fail('当前密码不正确',403);a.passwordHash=S.hashPassword(S.password(b.newPassword));db.auth=db.auth.filter(s=>s.accountId!==a.id);loginSession(res,audience,a);audit(a,'修改自己的密码',a.id);save();return send({ok:true});}
  if(audience==='user'){
   if(r.startsWith('/api/admin')||r==='/admin'||r.startsWith('/admin/'))S.fail('页面不存在',404);
   if(r==='/api/auth/register'&&req.method==='POST'){limited('register:'+req.socket.remoteAddress,8);const username=S.username(b.username),password=S.password(b.password),nickname=S.text(b.nickname,24);if(!nickname)S.fail('请填写昵称');const i=db.invites.find(i=>i.code===S.text(b.inviteCode,30).toUpperCase());if(!i||!i.enabled||Date.parse(i.expiresAt)<=Date.now()||i.used>=i.maxUses)S.fail('邀请码无效、已过期或使用次数已满');if(db.users.some(u=>u.username===username&&!u.deleted))S.fail('这个账号已注册');const u={id:S.id(),username,nickname,passwordHash:S.hashPassword(password),enabled:true,inviteId:i.id,createdAt:new Date().toISOString(),scoutStatus:'none',bookmarks:[]};db.users.push(u);i.used++;i.usage.push({userId:u.id,at:u.createdAt});audit(u,'邀请码注册',i.id);loginSession(res,'user',u);return send({account:safeAccount(u)},201);}
   if(r==='/api/catalog'&&req.method==='GET')return send({version:db.version,campus:campus.info,points:db.points.filter(p=>p.published).map(p=>({...p,...Popularity.stats(p)})),routes:db.routes.filter(r=>r.active),templates:db.templates.filter(t=>t.approved),map:publicMap(db.settings)});
   const viewRoute=r.match(/^\/api\/points\/([a-z0-9-]+)\/view$/);
   if(viewRoute&&req.method==='POST'){limited(ip+':point-view',60);if(Object.keys(b).some(k=>k!=='clientId'))S.fail('浏览参数无效');const point=db.points.find(p=>p.id===viewRoute[1]&&p.published);if(!point)S.fail('点位不存在',404);return send(pointViews.record(point,b.clientId,save));}
   if(r==='/api/plan'&&req.method==='POST'){const p=prefs(b);return send(db.routes.filter(r=>r.active).map(r=>plan(r,p)).sort((a,b)=>Number(b.match)-Number(a.match)));}
   if(r==='/api/bookmarks'&&req.method==='POST'){need();const p=db.points.find(p=>p.id===b.pointId&&p.published);if(!p)S.fail('点位不存在',404);a.bookmarks||=[];const index=a.bookmarks.indexOf(p.id);if(index>=0)a.bookmarks.splice(index,1);else a.bookmarks.push(p.id);save();return send({bookmarks:a.bookmarks});}
   if(r==='/api/scout/apply'&&req.method==='POST'){need();if(a.scoutStatus==='approved')S.fail('你已经是校园探索官');if(db.applications.some(x=>x.userId===a.id&&x.status==='pending'))S.fail('申请已经提交');const reason=S.text(b.reason,1000);if(reason.length<5)S.fail('申请理由至少 5 个字');const x={id:S.id(),userId:a.id,reason,status:'pending',at:new Date().toISOString(),note:''};db.applications.push(x);a.scoutStatus='pending';save();return send(x,201);}
   if(r==='/api/my/community'&&req.method==='GET'){need();return send({applications:db.applications.filter(x=>x.userId===a.id),points:db.points.filter(p=>p.authorId===a.id),reports:db.reports.filter(x=>x.userId===a.id)});}
   if(r==='/api/points'&&req.method==='POST'){need();if(a.scoutStatus!=='approved')S.fail('请先申请成为校园探索官并等待通过',403);const submissionId=typeof b.submissionId==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(b.submissionId)?b.submissionId:null;if(b.submissionId&&!submissionId)S.fail('发布标识无效');if(submissionId){const previous=db.points.find(p=>p.authorId===a.id&&p.submissionId===submissionId);if(previous)return send(previous,200);}limited(a.id+':publish',5);const name=S.text(b.name,60),description=S.text(b.description,1200),condition=S.text(b.condition,500),coords=campus.coordinate(b.lng,b.lat);if(!name||description.length<5||!condition||!['建筑','自然','人文','运动'].includes(b.theme))S.fail('请填写点位名称、介绍、分类与拍摄条件');const m=ownedMedia(b.mediaId,a);m.public=true;const p={id:S.id(),name,description,condition,theme:b.theme,...coords,fact:description,source:'校园探索官上传',allowed:condition,open:true,published:true,trust:'community',cover:'/media/'+m.id,mediaId:m.id,authorId:a.id,authorName:a.nickname,submissionId,createdAt:new Date().toISOString(),verifiedAt:null,version:1};db.points.push(p);db.version++;audit(a,'社区发布点位',p.id);save();return send(p,201);}
   if(r==='/api/reports'&&req.method==='POST'){need();if(a.scoutStatus!=='approved')S.fail('问题反馈需要校园探索官身份',403);limited(a.id+':report',8);const p=db.points.find(p=>p.id===b.pointId&&p.published);if(!p)S.fail('点位不存在',404);const description=S.text(b.description,1000);if(description.length<5)S.fail('请具体描述问题，至少 5 个字');const x={id:S.id(),pointId:p.id,userId:a.id,description,category:S.text(b.category,30),status:'pending',at:new Date().toISOString(),note:''};db.reports.push(x);audit(a,'提交点位反馈',p.id);save();return send(x,201);}
   if(r==='/api/checkins'&&req.method==='GET'){need();return send((db.checkins||[]).filter(c=>c.ownerId===a.id));}
   if(r==='/api/checkins'&&req.method==='POST'){
    need();const result=require('./lib/checkins.cjs').create(db,a,b);if(result.repeated)return send(result.record);
    limited(a.id+':checkin',20);const before=db.checkins;
    db.checkins=[...(before||[]),result.record];try{save();}catch(e){if(before)db.checkins=before;else delete db.checkins;throw e;}
    return send(result.record,201);
   }
   const ck=r.match(/^\/api\/checkins\/([a-f0-9-]+)$/);
   if(ck&&req.method==='DELETE'){
    need();const record=(db.checkins||[]).find(c=>c.id===ck[1]&&c.ownerId===a.id);if(!record)S.fail('打卡记录不存在',404);
    const before=db.checkins;db.checkins=before.filter(c=>c!==record);try{save();}catch(e){db.checkins=before;throw e;}
    purgeMedia(record.mediaId);save();return send({ok:true});
   }
   if(r==='/api/sessions'&&req.method==='GET'){need();return send(db.sessions.filter(s=>s.ownerId===a.id).map(sessionView));}
   if(r==='/api/sessions'&&req.method==='POST'){need();const p=prefs(b.preferences),rt=db.routes.find(r=>r.id===b.routeId);if(!rt)S.fail('路线不存在',404);const old=db.sessions.find(s=>s.ownerId===a.id&&['active','paused'].includes(s.status));if(old)return send(sessionView(old));const result=plan(rt,p);if(!result.available)S.fail(result.reason,409);const tasks=rt.points.map(pid=>{const point=db.points.find(p=>p.id===pid),t=db.templates.find(t=>t.pointId===pid&&t.approved);return {id:S.id(),pointId:pid,pointName:point.name,title:p.mode==='guide'?'观察这处校园空间':t.title,steps:p.mode==='guide'?[point.description,point.condition]:[...t.steps,...(p.people===2?[t.duo]:[])],minutes:2,condition:point.condition,status:'pending',reason:'',mediaId:null};});const s={id:S.id(),ownerId:a.id,routeId:rt.id,routeName:rt.name,preferences:p,plan:result,tasks,track:[],version:db.version,status:'active',elapsed:0,lastResume:Date.now(),createdAt:new Date().toISOString(),feedback:'',rating:0,generation:p.mode==='personal'?'按偏好匹配审核模板 · 未接入 AI 模型':p.mode==='guide'?'普通导览':'固定拍摄任务'};db.sessions.push(s);db.logs.push({id:S.id(),at:s.createdAt,route:rt.name,status:p.mode==='personal'?'模板回退':'校验通过',total:result.total,budget:p.budget,version:db.version});save();return send(sessionView(s),201);}
   const sm=r.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(export|track))?$/);
   if(sm){need();const s=db.sessions.find(s=>s.id===sm[1]&&s.ownerId===a.id);if(!s)S.fail('记录不存在',404);
    if(req.method==='DELETE'){db.sessions=db.sessions.filter(x=>x!==s);save();for(const t of s.tasks)if(t.mediaId)purgeMedia(t.mediaId);save();return send({ok:true});}
    if(sm[2]==='export'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="nmu-note-${s.id.slice(0,8)}.html"`});return res.end(exportHTML(s));}
    if(sm[2]==='track'&&req.method==='POST'){if(s.status!=='active')S.fail('暂停或结束时不能记录轨迹');if(!Array.isArray(b.points)||!b.points.length||b.points.length>50||s.track.length+b.points.length>10000)S.fail('轨迹点数量无效');const points=b.points.map(p=>{const c=campus.coordinate(p.lng,p.lat);if(!Number.isFinite(p.at)||Math.abs(Date.now()-p.at)>86400000||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>200)S.fail('定位精度或时间无效');return {...c,at:p.at,accuracy:p.accuracy};}).sort((x,y)=>x.at-y.at);let last=s.track.at(-1)?.at||0;for(const p of points)if(p.at>last){s.track.push(p);last=p.at;}save();return send({count:s.track.length});}
    if(req.method==='PATCH'){const action=b.action;
     if(action==='pause'&&s.status==='active'){s.elapsed=elapsed(s);s.status='paused';}
     else if(action==='resume'&&s.status==='paused'){if(sessionView(s).blocked.length)S.fail('点位已经下线，请结束后重新选择',409);s.status='active';s.lastResume=Date.now();}
     else if(['finish','exit'].includes(action)){if(!['active','paused'].includes(s.status))S.fail('探索已经结束');if(action==='finish'&&s.tasks.some(t=>t.status==='pending'))S.fail('请先完成或跳过剩余任务');s.elapsed=elapsed(s);s.status=action==='finish'?'completed':'ended';s.endedAt=new Date().toISOString();}
     else if(action==='task'){if(s.status!=='active')S.fail('请先恢复探索');if(sessionView(s).blocked.length)S.fail('当前点位或路线已下线，不能继续任务',409);const t=s.tasks.find(t=>t.id===b.taskId);if(!t||!['done','skipped'].includes(b.status))S.fail('任务状态无效');if(b.status==='skipped'&&!S.text(b.reason))S.fail('请填写跳过原因');t.status=b.status;t.completedAt=b.status==='done'?(t.completedAt||new Date().toISOString()):null;t.reason=b.status==='skipped'?S.text(b.reason,300):'';}
     else if(action==='photo'){const t=s.tasks.find(t=>t.id===b.taskId);if(!t)S.fail('任务不存在');const previous=t.mediaId;if(b.mediaId===null)t.mediaId=null;else{ownedMedia(b.mediaId,a);t.mediaId=b.mediaId;}save();if(previous!==t.mediaId)purgeMedia(previous);}
     else if(action==='feedback'){s.feedback=S.text(b.feedback);s.rating=[0,1,2,3,4,5].includes(b.rating)?b.rating:0;}else S.fail('当前状态不支持此操作');save();return send(sessionView(s));}
   }
  } else {
   if(r==='/api/auth/register')S.fail('管理员不能自行注册',404);
   if(r.startsWith('/api/admin/content-deletion/')){
    need();const session=authSession(req,'admin'),key=session.hash;
    for(const [k,v] of deleteIntents)if(v.expires<=Date.now())deleteIntents.delete(k);
    for(const [k,v] of deleteVerifications)if(v.until<=Date.now())deleteVerifications.delete(k);
    const grant=deleteVerifications.get(key);
    const verified=grant&&grant.accountId===a.id&&grant.passwordHash===a.passwordHash&&grant.ip===ip&&grant.until>Date.now();
    if(r==='/api/admin/content-deletion/verification'&&req.method==='GET')return send({verifiedUntil:verified?grant.until:null});
    if(r==='/api/admin/content-deletion/prepare'&&req.method==='POST'){
     limited(a.id+':delete-prepare',30);const plan=deletion.preview(b.type,b.id);
     if(b.remember!==true||!verified||b.password){
      if(b.remember===true&&!verified&&!b.password)S.fail('免重复验证已失效，请输入当前管理员密码',403);
      limited(a.id+':delete-password',5);
      if(typeof b.password!=='string'||b.password.length>128||!S.verifyPassword(b.password,a.passwordHash)){
       audit(a,'删除密码验证失败',b.id,'未执行删除');save();S.fail('当前管理员密码不正确',403);
      }
      if(b.remember===true)deleteVerifications.set(key,{accountId:a.id,passwordHash:a.passwordHash,ip,until:Date.now()+15*60000});
      else deleteVerifications.delete(key);
      audit(a,'验证内容删除权限',b.id,b.remember===true?'当前登录会话 15 分钟内免重复验证':'仅本次删除');save();
     }
     const token=crypto.randomBytes(32).toString('hex');
     deleteIntents.set(S.digest(token),{accountId:a.id,sessionHash:key,passwordHash:a.passwordHash,ip,type:b.type,id:b.id,fingerprint:plan.fingerprint,expires:Date.now()+5*60000});
     return send({confirmationToken:token,preview:plan.result,verifiedUntil:deleteVerifications.get(key)?.until||null});
    }
    if(r==='/api/admin/content-deletion/commit'&&req.method==='POST'){
     if(b.confirmed!==true)S.fail('请完成第二次不可逆删除确认',400);
     const token=typeof b.confirmationToken==='string'&&/^[a-f0-9]{64}$/.test(b.confirmationToken)?S.digest(b.confirmationToken):'';
     const intent=deleteIntents.get(token);
     if(!intent||intent.accountId!==a.id||intent.sessionHash!==key||intent.passwordHash!==a.passwordHash||intent.ip!==ip||intent.expires<=Date.now())S.fail('删除确认已失效，请重新验证并确认',403);
     const plan=deletion.preview(intent.type,intent.id);
     if(plan.fingerprint!==intent.fingerprint){deleteIntents.delete(token);S.fail('内容或照片引用已变化，请重新查看删除范围并确认',409);}
     const result=deletion.execute(plan,a,audit);deleteIntents.delete(token);return send({ok:true,...result});
    }
    S.fail('接口不存在',404);
   }
   if(r==='/api/admin/audit'&&req.method==='GET'){
    need();const limit=Math.min(100,Math.max(1,Math.floor(Number(url.searchParams.get('limit'))||50)));
    let events=db.audit.slice().reverse();if(url.searchParams.get('deletions')==='true')events=events.filter(e=>e.action==='永久删除内容');
    const before=url.searchParams.get('before');if(before){const index=events.findIndex(e=>e.id===before);if(index<0)S.fail('日志游标无效');events=events.slice(index+1);}
    return send({events:events.slice(0,limit).map(auditView),nextBefore:events.length>limit?events[limit-1].id:null});
   }
   if(r==='/api/admin/overview'&&req.method==='GET'){need();return send({account:safeAccount(a),version:db.version,points:db.points.map(p=>({...p,...Popularity.stats(p)})),routes:db.routes,templates:db.templates,users:db.users.filter(u=>!u.deleted).map(safeAccount),invites:db.invites,applications:db.applications,reports:db.reports,admins:a.role==='super'?db.admins.filter(a=>!a.deleted).map(safeAccount):[],sessions:db.sessions.map(({ownerId,tasks,track,...s})=>({...s,userId:ownerId,tasks:tasks.map(({mediaId,photo,...t})=>({...t,hasPhoto:!!mediaId||!!photo})),trackCount:track.length})),audit:db.audit.slice(-100).map(auditView),logs:db.logs.slice(-100),settings:null,legacyArchive:db.legacyArchive||null});}
   if(r==='/api/admin/invites'&&req.method==='POST'){
    need();const maxUses=Number(b.maxUses),days=Number(b.days),mode=b.mode??'auto';
    if(!Number.isInteger(maxUses)||maxUses<1||maxUses>500||!Number.isInteger(days)||days<1||days>90)S.fail('名额 1—500，有效期 1—90 天');
    if(!['auto','manual'].includes(mode))S.fail('请选择自动生成或手动填写');
    let code;if(mode==='manual'){code=typeof b.code==='string'?b.code.trim().toUpperCase():'';if(!/^[A-Z0-9]{6,30}$/.test(code))S.fail('手动邀请码需要 6—30 位字母或数字');if(db.invites.some(i=>i.code.toUpperCase()===code))S.fail('这个邀请码已存在，请换一个',409);}
    else do{code=crypto.randomBytes(6).toString('hex').toUpperCase();}while(db.invites.some(i=>i.code.toUpperCase()===code));
    const i={id:S.id(),code,generationMode:mode,maxUses,used:0,enabled:true,expiresAt:new Date(Date.now()+days*86400000).toISOString(),creatorId:a.id,creator:a.username,note:S.text(b.note,100),usage:[],createdAt:new Date().toISOString()};
    db.invites.push(i);audit(a,mode==='manual'?'创建手动邀请码':'自动生成邀请码',i.id);save();return send(i,201);
   }
   const im=r.match(/^\/api\/admin\/invites\/([a-f0-9-]+)$/);if(im&&req.method==='PATCH'){
    need();const i=db.invites.find(i=>i.id===im[1]);if(!i)S.fail('邀请码不存在',404);const has=k=>Object.hasOwn(b,k);
    if(!['enabled','maxUses','note'].some(has)||Object.keys(b).some(k=>!['enabled','maxUses','note'].includes(k)))S.fail('可调整邀请码状态、总名额与备注');
    if(has('enabled')&&typeof b.enabled!=='boolean')S.fail('邀请码状态无效');
    const maxUses=has('maxUses')?Number(b.maxUses):i.maxUses;if(!Number.isInteger(maxUses)||maxUses<1||maxUses>500)S.fail('总邀请名额需要为 1—500 的整数');if(maxUses<i.used)S.fail(`已经有 ${i.used} 个用户注册，总名额不能小于已使用人数`);
    const previous=i.maxUses;if(has('enabled'))i.enabled=b.enabled;i.maxUses=maxUses;if(has('note'))i.note=S.text(b.note,100);
    audit(a,'编辑邀请码',i.id,`总名额 ${previous} → ${i.maxUses}；${i.enabled?'启用':'停用'}`);save();return send(i);
   }
   const popularityRoute=r.match(/^\/api\/admin\/points\/([a-z0-9-]+)\/popularity$/);
   if(popularityRoute&&req.method==='PATCH'){
    superOnly();const point=db.points.find(p=>p.id===popularityRoute[1]);if(!point)S.fail('点位不存在',404);
    const offset=Popularity.adjustment(point,b),previous=point.popularityOffset,oldAudit=[...db.audit],oldVersion=db.version,before=Popularity.stats(point);
    point.popularityOffset=offset;db.version++;
    try{audit(a,'调整机位热度',point.id,'排序热度 '+before.popularity+' → '+Popularity.stats(point).popularity+'；实际详情浏览 '+before.viewCount+(b.useActual?'；恢复实际浏览排序':''));save();}catch(error){if(previous===undefined)delete point.popularityOffset;else point.popularityOffset=previous;db.audit=oldAudit;db.version=oldVersion;throw error;}
    return send(Popularity.stats(point));
   }
   if(r==='/api/admin/admins'&&req.method==='POST'){superOnly();const username=S.username(b.username);if(!['super','normal'].includes(b.role))S.fail('管理员角色无效');if(db.admins.some(a=>a.username===username&&!a.deleted))S.fail('管理员账号已存在');const x={id:S.id(),username,name:S.text(b.name,30)||username,role:b.role,enabled:true,passwordHash:S.hashPassword(S.password(b.password)),createdBy:a.id,createdAt:new Date().toISOString()};db.admins.push(x);audit(a,'创建管理员',x.id,x.role);save();return send(safeAccount(x),201);}
   const am=r.match(/^\/api\/admin\/admins\/([a-f0-9-]+)$/);if(am&&['PATCH','DELETE'].includes(req.method)){superOnly();const x=db.admins.find(x=>x.id===am[1]&&!x.deleted);if(!x)S.fail('管理员不存在',404);if(x.id===a.id&&(req.method==='DELETE'||b.enabled===false||b.role==='normal'))S.fail('不能删除、停用或降低当前自己的权限');if(x.id===a.id&&b.password)S.fail('修改自己的密码请验证当前密码后操作');const demoting=req.method==='DELETE'||b.enabled===false||b.role==='normal';if(x.role==='super'&&x.enabled&&demoting&&db.admins.filter(a=>a.role==='super'&&a.enabled&&!a.deleted).length<=1)S.fail('必须保留至少一个可用超级管理员');const update={};if(req.method==='DELETE'){update.deleted=true;update.enabled=false;}else{if('enabled'in b)update.enabled=b.enabled===true;if('role'in b){if(!['super','normal'].includes(b.role))S.fail('角色无效');update.role=b.role;}if(b.password)update.passwordHash=S.hashPassword(S.password(b.password));if(b.name)update.name=S.text(b.name,30);}Object.assign(x,update);if(x.id!==a.id)db.auth=db.auth.filter(t=>t.accountId!==x.id);audit(a,'管理管理员账号',x.id);save();return send(safeAccount(x));}
   const um=r.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/);if(um&&['PATCH','DELETE'].includes(req.method)){need();const u=db.users.find(u=>u.id===um[1]&&!u.deleted);if(!u)S.fail('用户不存在',404);const update={};if(req.method==='DELETE'){update.deleted=true;update.enabled=false;}else{if('enabled'in b)update.enabled=b.enabled===true;if(b.password)update.passwordHash=S.hashPassword(S.password(b.password));if('scoutStatus'in b){if(!['none','approved'].includes(b.scoutStatus))S.fail('探索官状态无效');update.scoutStatus=b.scoutStatus;}}Object.assign(u,update);db.auth=db.auth.filter(t=>t.accountId!==u.id);audit(a,'管理用户账号',u.id);save();return send(safeAccount(u));}
   const ap=r.match(/^\/api\/admin\/applications\/([a-f0-9-]+)$/);if(ap&&req.method==='PATCH'){need();const x=db.applications.find(x=>x.id===ap[1]);if(!x||x.status!=='pending')S.fail('申请不存在或已经处理');if(!['approved','rejected'].includes(b.status))S.fail('审核状态无效');x.status=b.status;x.note=S.text(b.note,500);x.reviewedBy=a.id;x.reviewedAt=new Date().toISOString();const u=db.users.find(u=>u.id===x.userId);if(u)u.scoutStatus=b.status;audit(a,'审核探索官',x.id,b.status);save();return send(x);}
   const pm=r.match(/^\/api\/admin\/points\/([a-z0-9-]+)$/);if(pm&&req.method==='PATCH'){need();const p=db.points.find(p=>p.id===pm[1]);if(!p)S.fail('点位不存在',404);const update={};if('lng'in b||'lat'in b)Object.assign(update,campus.coordinate(b.lng??p.lng,b.lat??p.lat));for(const key of ['name','description','condition','source','allowed'])if(key in b){if(!S.text(b[key]))S.fail('点位资料不能为空');update[key]=S.text(b[key]);}if(b.theme){if(!['建筑','自然','人文','运动'].includes(b.theme))S.fail('分类无效');update.theme=b.theme;}if('open'in b)update.open=b.open===true;if('published'in b)update.published=b.published===true;if(b.certify===true){update.trust='certified';update.verifiedAt=new Date().toISOString().slice(0,10);update.certifiedBy=a.id;}Object.assign(p,update);p.version++;db.version++;audit(a,'维护点位',p.id,b.certify?'认证通过':'资料或上下线更新');save();return send(p);}
   const rm=r.match(/^\/api\/admin\/reports\/([a-f0-9-]+)$/);if(rm&&req.method==='PATCH'){need();const x=db.reports.find(x=>x.id===rm[1]);if(!x||x.status!=='pending')S.fail('反馈不存在或已处理');if(!['resolve','reject','offline','online'].includes(b.action))S.fail('处理方式无效');const p=db.points.find(p=>p.id===x.pointId);if(['offline','online'].includes(b.action)&&p){p.published=b.action==='online';p.open=b.action==='online';p.version++;db.version++;}x.status=b.action==='reject'?'rejected':'resolved';x.note=S.text(b.note,1000);x.reviewedBy=a.id;x.reviewedAt=new Date().toISOString();audit(a,'处理点位反馈',x.id,b.action);save();return send(x);}
   const cm=r.match(/^\/api\/admin\/(routes|templates)\/([a-z0-9]+)$/);if(cm&&req.method==='PATCH'){need();const x=db[cm[1]].find(x=>x.id===cm[2]);if(!x)S.fail('内容不存在',404);if(cm[1]==='routes'){if(b.active===true&&!x.points.length)S.fail('路线已没有点位，不能重新启用',409);if('active'in b)x.active=b.active===true;if('walk'in b){if(!Number.isFinite(b.walk)||b.walk<1||b.walk>60)S.fail('步行时间为 1—60 分钟');x.walk=b.walk;}if('timing'in b){if(!Number.isFinite(b.timing)||b.timing<1||b.timing>60)S.fail('实走时间为 1—60 分钟');x.timings.push({minutes:b.timing,at:new Date().toISOString()});x.measured=x.timings.length>=3;}}else{if('title'in b){if(!S.text(b.title))S.fail('标题不能为空');x.title=S.text(b.title,100);}if('steps'in b){if(!Array.isArray(b.steps)||!b.steps.length||b.steps.some(t=>!S.text(t)))S.fail('步骤不能为空');x.steps=b.steps.map(t=>S.text(t,500));}if('approved'in b)x.approved=b.approved===true;}x.version++;db.version++;audit(a,'更新'+cm[1],x.id);save();return send(x);}
   if(r==='/api/admin/map-config/unlock'&&req.method==='POST'){superOnly();limited(ip+':map-unlock',5);const result=mapSettings.unlock(a,authSession(req,audience).hash,ip,b);audit(a,'验证地图配置权限','map','验证者 ID '+result.verifiedBy);save();return send(result);}
   if(r==='/api/admin/map-config/read'&&req.method==='POST'){return send(mapSettings.read(a,authSession(req,audience)?.hash,ip,b.verification));}
   if(r==='/api/admin/map-config/lock'&&req.method==='POST'){superOnly();mapSettings.lock(b.verification);return send({ok:true});}
   if(r==='/api/admin/settings'&&req.method==='PATCH'){const result=mapSettings.update(a,authSession(req,audience)?.hash,ip,b);audit(a,'地图服务配置','map',b.mapProvider+' · 验证者 ID '+result.verifiedBy);save();return send(result);}
  }
  if(r==='/api/media'&&req.method==='POST'){need();limited(a.id+':upload',15);if(typeof b.photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.photo))S.fail('照片格式无效');const buffer=Buffer.from(b.photo.split(',')[1],'base64');if(buffer.length>5*1024*1024)S.fail('处理后照片请小于 5MB');const clean=S.cleanJPEG(buffer),m={id:S.id(),ownerId:a.id,public:false,deleted:false,at:new Date().toISOString()};fs.writeFileSync(path.join(mediaDir,m.id+'.jpg'),clean);db.media.push(m);save();return send({id:m.id,url:'/media/'+m.id},201);}
  const mm=r.match(/^\/media\/([a-f0-9-]+)$/);if(mm&&req.method==='GET'){const m=db.media.find(m=>m.id===mm[1]&&!m.deleted);if(!m||(!m.public&&(!a||a.id!==m.ownerId)))S.fail('照片不存在',404);const f=path.join(mediaDir,m.id+'.jpg');if(!fs.existsSync(f))S.fail('照片不存在',404);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':m.public?'private, max-age=60':'private, no-store'});return fs.createReadStream(f).pipe(res);}
  if(audience==='user'&&r.startsWith('/_AMapService/')&&req.method==='GET'){if(db.settings.mapProvider!=='amap'||!db.settings.amapKey||!db.settings.amapSecurity)S.fail('地图服务尚未配置',503);const suffix=r.slice('/_AMapService'.length);if(!/^\/v[345]\/(place|geocode|direction|map|ip|assistant)\//.test(suffix)&&suffix!=='/v3/ip')S.fail('地图接口不可用',404);const target=new URL(suffix,suffix.startsWith('/v4/map/')?'https://webapi.amap.com':'https://restapi.amap.com');target.search=url.search;target.searchParams.set('jscode',db.settings.amapSecurity);target.searchParams.set('key',db.settings.amapKey);const response=await fetch(target,{signal:AbortSignal.timeout(10000)});res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});return res.end(Buffer.from(await response.arrayBuffer()));}
  if(r.startsWith('/api/'))S.fail('接口不存在',404);if(!['GET','HEAD'].includes(req.method))S.fail('不支持该操作',405);
  const root=path.join(__dirname,'dist',audience),shared=path.join(__dirname,'dist','shared'),isShared=r.startsWith('/shared/'),allowed=isShared?shared:root;
  const file=isShared?path.resolve(shared,'.'+decodeURIComponent(r.slice('/shared'.length))):r==='/'?path.join(root,'index.html'):path.resolve(root,'.'+decodeURIComponent(r));
  if(!file.startsWith(allowed+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())S.fail('页面不存在',404);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
 } catch(e){if(!res.headersSent)send({error:e.status?e.message:'服务暂时不可用，请重试'},e.status||500);else res.end();if(!e.status)console.error(e);}
};}
for(const audience of ['user','admin']){const server=http.createServer(handler(audience));server.on('error',e=>{console.error(`${audience}: ${e.message}`);process.exit(1);});server.listen(ports[audience],'127.0.0.1',()=>console.log(`${audience}: http://${audience==='user'?'explore':'admin'}.localhost:${ports[audience]}`));}
// Test harnesses may skip expensive model work; ordinary startup always warms in the background.
if(process.env.EXPLORE_VOICE_WARMUP!=='0')navigationVoice.warmup().then(s=>console.log(`Navigation voice warmup: ${s.state} (${s.ready}/${s.total})`));
