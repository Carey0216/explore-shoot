const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=__dirname, PUBLIC=path.join(ROOT,'dist'), DATA=process.env.EXPLORE_DATA_DIR||path.join(ROOT,'data');
fs.mkdirSync(DATA,{recursive:true});
const DB=path.join(DATA,'store.json');
let db=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB,'utf8')):require('./seed.cjs')();
const save=()=>{fs.writeFileSync(DB+'.tmp',JSON.stringify(db,null,2));fs.renameSync(DB+'.tmp',DB);};
save();
const tokens=new Map(), attempts=new Map();
const uid=()=>crypto.randomUUID();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PORT=Number(process.env.PORT||4174);
function prefs(p){if(!p||![15,20,30].includes(p.budget)||![1,2].includes(p.people)||!['轻松','适中'].includes(p.intensity)||!['全部','建筑','自然','人文'].includes(p.theme)||!['fixed','personal','guide'].includes(p.mode))fail('请选择有效的探索偏好');return p;}
function plan(route,p){
 const ps=route.points.map(id=>db.points.find(x=>x.id===id));
 const walk=route.walk;
 const stay=route.points.length*2,buffer=Math.ceil(p.budget*.2),total=walk+stay+buffer;
 const available=route.active&&ps.every(x=>x?.open)&&route.points.every(id=>db.templates.some(t=>t.pointId===id&&t.approved))&&total<=p.budget&&(p.intensity!=='轻松'||route.intensity==='轻松');
 let reason=!route.active?'路线已停用':ps.some(x=>!x?.open)?'部分点位暂时关闭':!route.points.every(id=>db.templates.some(t=>t.pointId===id&&t.approved))?'任务等待审核':p.intensity==='轻松'&&route.intensity!=='轻松'?'需要适中步行强度':total>p.budget?`预计 ${total} 分钟，请增加时间预算`:'';
 return {...route,walk,stay,buffer,total,available,reason,match:p.theme==='全部'||route.theme===p.theme};
}
function publicSession(s){return {...s,blocked:s.tasks.filter(t=>t.status==='pending'&&!db.points.find(p=>p.id===t.pointId)?.open).map(t=>t.pointName)};}
function elapsed(s){return s.elapsed+(s.status==='active'?Date.now()-s.lastResume:0);}
function jpegClean(buf){
 if(buf[0]!==255||buf[1]!==216)fail('仅接受经网页处理后的 JPEG 照片');
 const chunks=[buf.subarray(0,2)];let i=2;
 while(i<buf.length){if(buf[i]!==255)fail('照片数据无效');const marker=buf[i+1];if(marker===218){chunks.push(buf.subarray(i));return Buffer.concat(chunks);}if(marker===217){chunks.push(buf.subarray(i,i+2));return Buffer.concat(chunks);}const size=buf.readUInt16BE(i+2);if(size<2||i+2+size>buf.length)fail('照片数据无效');if(![225,237,254].includes(marker))chunks.push(buf.subarray(i,i+2+size));i+=2+size;}fail('照片数据不完整');
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
  if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))fail('仅允许本机访问',403);
  if(req.method!=='GET'&&req.headers.origin&&!['http://127.0.0.1:'+PORT,'http://localhost:'+PORT].includes(req.headers.origin))fail('请求来源不允许',403);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,'http://127.0.0.1'), u=url.pathname;
  const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
  let owner=cookies.explorer;
  if(!owner||!/^[a-f0-9-]{36}$/.test(owner)){owner=uid();res.setHeader('Set-Cookie',`explorer=${owner}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);}
  const auth=tokens.get(cookies.admin);const admin=auth&&auth>Date.now();
  const guard=()=>{if(!admin)fail('请先登录管理端',401);};
  let body={};if(['POST','PUT','PATCH'].includes(req.method)){let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>8*1024*1024)fail('上传内容过大',413);chunks.push(c);}try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail('请求格式无效');}}
  if(u==='/api/health')return json({ok:true,app:'explore-shoot'});
  if(u==='/api/catalog'&&req.method==='GET')return json({version:db.version,points:db.points,routes:db.routes,templates:db.templates.filter(t=>t.approved),admin:!!admin});
  if(u==='/api/plan'&&req.method==='POST'){const p=prefs(body);return json(db.routes.map(r=>plan(r,p)).sort((a,b)=>Number(b.match)-Number(a.match)));}
  if(u==='/api/login'&&req.method==='POST'){
   const key=req.socket.remoteAddress,a=attempts.get(key)||{count:0,since:Date.now()};if(Date.now()-a.since>60000){a.count=0;a.since=Date.now();}if(a.count>=10)fail('尝试次数较多，请一分钟后重试',429);a.count++;attempts.set(key,a);
   const expected=crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD||'Explore2026!').digest(),actual=crypto.createHash('sha256').update(String(body.password||'')).digest();
   if(body.username!=='admin'||!crypto.timingSafeEqual(actual,expected))fail('账号或密码不正确',401);
   const token=crypto.randomBytes(32).toString('hex');tokens.set(token,Date.now()+12*3600000);res.setHeader('Set-Cookie',`admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);return json({ok:true});
  }
  if(u==='/api/logout'&&req.method==='POST'){tokens.delete(cookies.admin);res.setHeader('Set-Cookie','admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json({ok:true});}
  if(u==='/api/sessions'&&req.method==='GET')return json(db.sessions.filter(s=>s.owner===owner).map(publicSession));
  if(u==='/api/sessions'&&req.method==='POST'){
   const p=prefs(body.preferences),r=db.routes.find(r=>r.id===body.routeId);if(!r)fail('路线不存在',404);
   const existing=db.sessions.find(s=>s.owner===owner&&['active','paused'].includes(s.status));if(existing)return json(publicSession(existing));
   const result=plan(r,p);if(!result.available)fail(result.reason||'当前路线不可用',409);
   const tasks=r.points.map((pid,i)=>{const point=db.points.find(x=>x.id===pid);const pool=db.templates.filter(t=>t.pointId===pid&&t.approved),t=pool[p.mode==='personal'&&p.theme==='自然'?pool.length-1:0];return {id:uid(),pointId:pid,pointName:point.name,templateId:t.id,title:p.mode==='guide'?'观察这个点位':t.title,steps:p.mode==='guide'?[point.fact,point.condition]:[...t.steps,...(p.people===2?[t.duo]:[])],condition:point.condition,fact:point.fact,minutes:t.minutes,status:'pending',reason:'',photo:null};});
   const s={id:uid(),owner,routeId:r.id,routeName:r.name,routePoints:[...r.points],preferences:p,plan:result,tasks,version:db.version,status:'active',createdAt:new Date().toISOString(),elapsed:0,lastResume:Date.now(),feedback:'',rating:0,generation:p.mode==='personal'?'未配置模型接口，已回退到审核模板；按人数匹配互动步骤':p.mode==='guide'?'普通导览':'固定任务模板'};
   db.sessions.push(s);db.logs.push({id:uid(),at:s.createdAt,route:r.name,mode:p.mode,status:p.mode==='personal'?'模板回退':'校验通过',reason:s.generation,version:db.version,total:result.total,budget:p.budget});save();return json(publicSession(s),201);
  }
  const sm=u.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(export))?$/);
  if(sm){const s=db.sessions.find(s=>s.id===sm[1]&&s.owner===owner);if(!s)fail('记录不存在',404);
   if(req.method==='DELETE'){db.sessions=db.sessions.filter(x=>x!==s);save();return json({ok:true});}
   if(sm[2]==='export'&&req.method==='GET'){
    const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(s.routeName)} · 探索回忆</title><style>body{font:16px/1.8 system-ui;max-width:800px;margin:60px auto;padding:24px;color:#193f36}img{max-width:100%;border-radius:16px}article{border-top:1px solid #ddd;padding:24px 0}small{color:#60766c}</style><h1>${esc(s.routeName)}</h1><p>${esc(s.createdAt.slice(0,10))} · ${s.preferences.people} 人探索 · 已完成 ${s.tasks.filter(t=>t.status==='done').length}/${s.tasks.length}</p><small>虚构校园演示记录 · 自报完成 · ${esc(s.generation)}</small>${s.tasks.map(t=>`<article><h2>${esc(t.pointName)} · ${esc(t.title)}</h2><p>${esc(t.status==='done'?'已完成':t.status==='skipped'?'已跳过：'+t.reason:'未完成')}</p>${t.photo?`<img alt="${esc(t.title)}" src="${t.photo}">`:''}</article>`).join('')}<h2>我的感受</h2><p>${esc(s.feedback||'没有填写感受').replace(/\n/g,'<br>')}</p></html>`;
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="explore-${s.id.slice(0,8)}.html"`});return res.end(html);
   }
   if(req.method==='PATCH'){
    const action=body.action;
    if(action==='pause'&&s.status==='active'){s.elapsed=elapsed(s);s.status='paused';}
    else if(action==='resume'&&s.status==='paused'){if(publicSession(s).blocked.length)fail('未完成点位已关闭，请结束体验或等待重新开放',409);s.status='active';s.lastResume=Date.now();}
    else if(action==='finish'||action==='exit'){if(!['active','paused'].includes(s.status))fail('体验已经结束');if(action==='finish'&&s.tasks.some(t=>t.status==='pending'))fail('请先完成或跳过剩余任务');s.elapsed=elapsed(s);s.status=action==='finish'?'completed':'ended';s.endedAt=new Date().toISOString();}
    else if(action==='task'){
     if(s.status!=='active')fail('请先恢复体验');if(publicSession(s).blocked.length)fail('未完成点位已关闭，请结束体验',409);
     const t=s.tasks.find(t=>t.id===body.taskId);if(!t)fail('任务不存在');if(!['done','skipped'].includes(body.status))fail('任务状态无效');if(body.status==='skipped'&&!str(body.reason))fail('请填写跳过原因');t.status=body.status;t.reason=body.status==='skipped'?str(body.reason,300):'';
    }
    else if(action==='photo'){
     const t=s.tasks.find(t=>t.id===body.taskId);if(!t)fail('任务不存在');
     if(body.photo===null)t.photo=null;else{if(typeof body.photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo))fail('照片格式无效');const b=Buffer.from(body.photo.split(',')[1],'base64');if(b.length>5*1024*1024)fail('照片不能超过 5MB');t.photo='data:image/jpeg;base64,'+jpegClean(b).toString('base64');}
    }
    else if(action==='feedback'){s.feedback=str(body.feedback);s.rating=[0,1,2,3,4,5].includes(body.rating)?body.rating:0;}
    else fail('当前状态不支持此操作');save();return json(publicSession(s));
   }
  }
  if(u==='/api/admin'&&req.method==='GET'){guard();return json({...db,sessions:db.sessions.map(({owner,tasks,...s})=>({...s,tasks:tasks.map(({photo,...t})=>({...t,hasPhoto:!!photo}))}))});}
  const am=u.match(/^\/api\/admin\/(points|routes|templates)\/([a-z0-9]+)$/);
  if(am&&req.method==='PATCH'){
   guard();const item=db[am[1]].find(x=>x.id===am[2]);if(!item)fail('资料不存在',404);
   if(am[1]==='points'){for(const k of ['name','fact','condition','source','allowed'])if(k in body){if(!str(body[k]))fail('资料不能为空');item[k]=str(body[k]);}if('open'in body)item.open=body.open===true;if('verifiedAt'in body){if(body.verifiedAt!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(body.verifiedAt))fail('核实日期无效');item.verifiedAt=body.verifiedAt;}}
   if(am[1]==='routes'){if('active'in body)item.active=body.active===true;if('walk'in body){if(!Number.isFinite(body.walk)||body.walk<1||body.walk>60)fail('步行时间应为 1—60 分钟');item.walk=body.walk;}if('timing'in body){if(!Number.isFinite(body.timing)||body.timing<1||body.timing>60)fail('实测时间应为 1—60 分钟');item.timings.push({minutes:body.timing,at:new Date().toISOString()});}}
   if(am[1]==='templates'){if('title'in body){if(!str(body.title))fail('标题不能为空');item.title=str(body.title,100);}if('steps'in body){if(!Array.isArray(body.steps)||!body.steps.length||body.steps.some(x=>!str(x)))fail('步骤不能为空');item.steps=body.steps.map(x=>str(x,500));}if('approved'in body)item.approved=body.approved===true;}
   item.version++;db.version++;db.audit.push({at:new Date().toISOString(),type:am[1],id:item.id,version:db.version,summary:item.name||item.title});save();return json(item);
  }
  if(u.startsWith('/api/'))fail('接口不存在',404);
  if(req.method!=='GET')fail('不支持此操作',405);
  const file=u==='/'||u==='/admin'||u==='/user'?path.join(PUBLIC,'index.html'):path.resolve(PUBLIC,'.'+decodeURIComponent(u));
  if(!file.startsWith(PUBLIC+path.sep))fail('访问被拒绝',403);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail('文件不存在',404);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);
 }catch(e){if(!res.headersSent)json({error:e.status?e.message:'服务暂时无法保存，请重试'},e.status||500);else res.end();if(!e.status)console.error(e);}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`探索与拍摄: http://127.0.0.1:${PORT}`));
