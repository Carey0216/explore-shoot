const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),RUNS=path.resolve(__dirname,'.runs'),DIR=path.join(RUNS,'deletion-'+Date.now());
const S=require('../lib/security.cjs'),PASSWORD='DeleteTest2026!',NORMAL='NormalTest2026!';
let child,checks=0;
fs.mkdirSync(DIR,{recursive:true});
// Test-only clock for exercising expiry without waiting fifteen minutes.
const clock=path.join(DIR,'clock.cjs'),offset=path.join(DIR,'offset');fs.writeFileSync(offset,'0');
fs.writeFileSync(clock,`const fs=require('node:fs');const now=Date.now;Date.now=()=>now()+Number(fs.readFileSync(${JSON.stringify(offset)},'utf8'));`);
const originalDirectory=process.env.EXPLORE_DATA_DIR;process.env.EXPLORE_DATA_DIR=DIR;
const store=require('../lib/store.cjs')(PASSWORD);if(originalDirectory===undefined)delete process.env.EXPLORE_DATA_DIR;else process.env.EXPLORE_DATA_DIR=originalDirectory;
const {db,save}=store,normal={id:S.id(),username:'moderator',name:'普通管理员',role:'normal',enabled:true,passwordHash:S.hashPassword(NORMAL)};
db.admins.push(normal);
const user={id:S.id(),username:'scout',nickname:'测试探索官',enabled:true,passwordHash:S.hashPassword(PASSWORD),scoutStatus:'approved',bookmarks:[]};db.users.push(user);
const jpg=fs.readFileSync(path.join(ROOT,'dist/shared/nmu-library.jpg'));
fs.mkdirSync(path.join(DIR,'media'),{recursive:true});
const makePhoto=()=>{const id=S.id();db.media.push({id,ownerId:user.id,public:true,deleted:false});fs.writeFileSync(path.join(DIR,'media',id+'.jpg'),jpg);return id;};
const unique=makePhoto(),shared=makePhoto(),privatePhoto=makePhoto();
function point(name,media,published=false){const p={...db.points[0],id:S.id(),name,published,mediaId:media,cover:media?'/media/'+media:null,authorId:user.id};db.points.push(p);return p;}
const uniquePoint=point('独占照片点位',unique),sharedPoint=point('共享照片点位',shared),otherPoint=point('保留共享照片的点位',shared,true),privatePoint=point('私人记录引用的点位',privatePhoto),plainPoint=point('无照片点位',null),cancelPoint=point('取消删除点位',null);
db.routes.push({id:'deleteroute',name:'关联路线',points:[uniquePoint.id,'nmu1'],active:true,version:1,timings:[]});
db.templates.push({id:'deletetemplate',pointId:uniquePoint.id,title:'关联模板',approved:true,steps:['步骤'],version:1});
db.reports.push({id:S.id(),pointId:uniquePoint.id,userId:user.id,status:'pending',description:'关联反馈'});user.bookmarks.push(uniquePoint.id);
db.sessions.push({id:S.id(),ownerId:user.id,routeId:'nroute1',routeName:'保留的私人手记',status:'completed',elapsed:0,tasks:[{id:S.id(),pointId:privatePoint.id,pointName:privatePoint.name,status:'done',mediaId:privatePhoto},{id:S.id(),pointId:uniquePoint.id,pointName:uniquePoint.name,status:'done',mediaId:null}],track:[],createdAt:new Date().toISOString()});save();
async function start(){child=spawn(process.execPath,['--require',clock,path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,PORT:'4204',ADMIN_PORT:'4206',EXPLORE_DATA_DIR:DIR,ADMIN_PASSWORD:PASSWORD},windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error(errors);try{if((await fetch('http://127.0.0.1:4206/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server failed: '+errors);}
async function stop(){if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});}
function client(audience){let cookie='';const request=async(url,method='GET',body,status=200,extra={})=>{const response=await fetch('http://127.0.0.1:'+(audience==='admin'?4206:4204)+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});for(const c of response.headers.getSetCookie())cookie=c.split(';')[0];const raw=await response.text();assert.equal(response.status,status,method+' '+url+' '+raw.slice(0,250));checks++;return response.headers.get('content-type')?.includes('json')?JSON.parse(raw):raw;};return request;}
const prepare=(c,type,id,extra={},status=200)=>c('/api/admin/content-deletion/prepare','POST',{type,id,...extra},status);
const commit=(c,prepared,extra={},status=200)=>c('/api/admin/content-deletion/commit','POST',{confirmationToken:prepared.confirmationToken,confirmed:true,...extra},status);
function persisted(){return JSON.parse(fs.readFileSync(path.join(DIR,'store-v2.json'),'utf8'));}
(async()=>{try{
 await start();const root=client('admin'),second=client('admin'),mod=client('admin'),guest=client('admin'),userClient=client('user');
 await root('/api/auth/login','POST',{username:'admin',password:PASSWORD});await second('/api/auth/login','POST',{username:'admin',password:PASSWORD});await mod('/api/auth/login','POST',{username:'moderator',password:NORMAL});await userClient('/api/auth/login','POST',{username:'scout',password:PASSWORD});
 await prepare(guest,'points',uniquePoint.id,{},401);await prepare(userClient,'points',uniquePoint.id,{},404);
 await prepare(root,'points','nmu1',{password:PASSWORD},409);await prepare(root,'admins',normal.id,{password:PASSWORD},400);
 await prepare(root,'points',uniquePoint.id,{password:NORMAL},403);assert(fs.existsSync(path.join(DIR,'media',unique+'.jpg')));
 let first=await prepare(root,'points',uniquePoint.id,{password:PASSWORD});assert.equal(first.preview.deletedPhotos,1);assert.equal(first.preview.relatedTemplates,1);assert.equal(first.preview.affectedRoutes,1);assert.equal(first.preview.relatedReports,1);
 await userClient('/api/sessions/'+db.sessions[0].id,'PATCH',{action:'photo',taskId:db.sessions[0].tasks[1].id,mediaId:unique});await commit(root,first,{},409);assert(fs.existsSync(path.join(DIR,'media',unique+'.jpg')));
 await userClient('/api/sessions/'+db.sessions[0].id,'PATCH',{action:'photo',taskId:db.sessions[0].tasks[1].id,mediaId:null});first=await prepare(root,'points',uniquePoint.id,{password:PASSWORD});
 await commit(root,first,{confirmed:false},400);await commit(mod,first,{},403);await commit(second,first,{},403);
 await root('/api/admin/points/'+uniquePoint.id,'DELETE',undefined,404);
 const done=await commit(root,first,{},200);assert.equal(done.cleanupPending,0);assert(!fs.existsSync(path.join(DIR,'media',unique+'.jpg')));
 let disk=persisted();assert(!disk.points.some(p=>p.id===uniquePoint.id));assert(!disk.media.some(m=>m.id===unique));assert(!disk.templates.some(t=>t.pointId===uniquePoint.id));assert(!disk.reports.some(t=>t.pointId===uniquePoint.id));assert(!disk.users.find(u=>u.id===user.id).bookmarks.includes(uniquePoint.id));assert.deepEqual(disk.routes.find(r=>r.id==='deleteroute').points,['nmu1']);assert.equal(disk.routes.find(r=>r.id==='deleteroute').active,false);assert.equal(disk.sessions[0].tasks.length,2);
 await commit(root,first,{},403);await userClient('/media/'+unique,'GET',undefined,404);
 const deletionLog=disk.audit.find(e=>e.action==='永久删除内容');assert.equal(deletionLog.actor,'admin');assert.equal(deletionLog.actorId,db.admins[0].id);assert.equal(deletionLog.actorRole,'super');assert.equal(deletionLog.ip,'127.0.0.1');assert(!isNaN(Date.parse(deletionLog.at)));
 const remembered=await prepare(mod,'points',sharedPoint.id,{password:NORMAL,remember:true});assert(remembered.verifiedUntil>Date.now());assert.equal(remembered.preview.preservedPhotos,1);await commit(mod,remembered);
 assert(fs.existsSync(path.join(DIR,'media',shared+'.jpg')));assert(persisted().media.find(m=>m.id===shared).public);
 const privateDelete=await prepare(mod,'points',privatePoint.id,{remember:true});assert.equal(privateDelete.preview.preservedPhotos,1);await commit(mod,privateDelete);
 assert(fs.existsSync(path.join(DIR,'media',privatePhoto+'.jpg')));assert.equal(persisted().media.find(m=>m.id===privatePhoto).public,false);await client('user')('/media/'+privatePhoto,'GET',undefined,404);await userClient('/media/'+privatePhoto);
 // Cancellation does not touch content; even remembered verification needs a new second confirmation.
 await prepare(mod,'points',cancelPoint.id,{remember:true});assert(persisted().points.some(p=>p.id===cancelPoint.id));
 await mod('/api/admin/content-deletion/commit','POST',{confirmed:true},403);
 await prepare(mod,'points',plainPoint.id,{remember:false},403);
 const once=await prepare(mod,'points',plainPoint.id,{password:NORMAL,remember:false});assert.equal(once.verifiedUntil,null);assert.equal((await mod('/api/admin/content-deletion/verification')).verifiedUntil,null);
 // Re-onlining or editing after preview invalidates that deletion.
 await root('/api/admin/points/'+plainPoint.id,'PATCH',{published:true});await commit(mod,once,{},409);
 await root('/api/admin/points/'+plainPoint.id,'PATCH',{published:false});await commit(mod,once,{},409);
 const changed=await prepare(root,'points',plainPoint.id,{password:PASSWORD,remember:true});await root('/api/admin/points/'+plainPoint.id,'PATCH',{name:'名称已变更'});await commit(root,changed,{},409);
 // Expiry is authoritative on the server, not a browser countdown.
 const expired=await prepare(root,'points',cancelPoint.id,{remember:true});fs.writeFileSync(offset,String(6*60000));await commit(root,expired,{},403);
 fs.writeFileSync(offset,String(16*60000));assert.equal((await root('/api/admin/content-deletion/verification')).verifiedUntil,null);await prepare(root,'points',cancelPoint.id,{remember:true},403);
 fs.writeFileSync(offset,'0');
 // Routes and templates follow the same workflow and reject still-active content.
 await prepare(root,'routes','nroute1',{password:PASSWORD},409);await prepare(root,'templates','nt1',{password:PASSWORD},409);
 await root('/api/admin/templates/nt1','PATCH',{approved:false});const task=await prepare(root,'templates','nt1',{password:PASSWORD,remember:true});await commit(root,task);
 await root('/api/admin/routes/nroute2','PATCH',{active:false});await commit(root,await prepare(root,'routes','nroute2',{remember:true}));
 assert(!persisted().routes.some(r=>r.id==='nroute2'));assert(!persisted().templates.some(t=>t.id==='nt1'));
 const empty=await prepare(root,'routes','deleteroute',{remember:true});await commit(root,empty);assert(persisted().points.some(p=>p.id==='nmu1'));
 // Logs can be paged and filtered, and cannot be forged using proxy headers.
 const fakeIP=await prepare(root,'points',plainPoint.id,{remember:true});await commit(root,fakeIP,{},200);
 const page1=await root('/api/admin/audit?limit=2&deletions=true');assert.equal(page1.events.length,2);assert(page1.nextBefore);const page2=await root('/api/admin/audit?limit=2&deletions=true&before='+page1.nextBefore);assert(page2.events.every(e=>!page1.events.some(p=>p.id===e.id)));
 await root('/api/admin/audit?before=invalid','GET',undefined,400);await userClient('/api/admin/audit','GET',undefined,404);await guest('/api/admin/audit','GET',undefined,401);
 await root('/api/admin/points/'+cancelPoint.id,'PATCH',{condition:'重新确认引用情况'},200,{'X-Forwarded-For':'8.8.8.8'});assert.equal(persisted().audit.at(-1).ip,'127.0.0.1');
 // Changing one's password and restarting both revoke cached verification and intents.
 const pending=await prepare(mod,'points',cancelPoint.id,{password:NORMAL,remember:true});await mod('/api/auth/password','PATCH',{currentPassword:NORMAL,newPassword:'NewNormal2026!'});await commit(mod,pending,{},403);assert.equal((await mod('/api/admin/content-deletion/verification')).verifiedUntil,null);
 await root('/api/admin/admins/'+normal.id,'PATCH',{enabled:false});await prepare(mod,'points',cancelPoint.id,{password:'NewNormal2026!'},401);
 await stop();await start();assert.equal((await root('/api/admin/content-deletion/verification')).verifiedUntil,null);assert(!persisted().points.some(p=>p.id===uniquePoint.id));assert((await root('/api/admin/audit?deletions=true')).events.length>=6);
 // Failure paths: DB-save rollback, a blocked file's durable cleanup queue, and log retention.
 const UNIT=path.join(DIR,'unit');fs.mkdirSync(path.join(UNIT,'media'),{recursive:true});const pid=S.id(),mid=S.id(),file=path.join(UNIT,'media',mid+'.jpg');fs.writeFileSync(file,jpg);
 const unitDB={points:[{id:pid,name:'事务检查',published:false,mediaId:mid}],routes:[],templates:[],reports:[],sessions:[],users:[],media:[{id:mid,public:true}],audit:[],version:1};
 const unitFile=path.join(UNIT,'store.json');let failSave=true;const unit=require('../lib/content-deletion.cjs')({db:unitDB,directory:UNIT,save(){if(failSave)throw Error('disk full');fs.writeFileSync(unitFile,JSON.stringify(unitDB));}});
 const audit=(a,action,subject,detail)=>{const event={id:S.id(),action,subject,detail};unitDB.audit.push(event);return event;};
 assert.throws(()=>unit.execute(unit.preview('points',pid),db.admins[0],audit),/disk full/);assert.equal(unitDB.points.length,1);assert(fs.existsSync(file));assert.equal(unitDB.audit.length,0);
 failSave=false;const unlink=fs.unlinkSync;fs.unlinkSync=()=>{throw Object.assign(Error('locked'),{code:'EPERM'});};let result;try{result=unit.execute(unit.preview('points',pid),db.admins[0],audit);}finally{fs.unlinkSync=unlink;}
 assert.equal(result.cleanupPending,1);assert(fs.existsSync(file));assert.equal(unitDB.points.length,0);assert.equal(unitDB.pendingMediaDeletes.length,1);
 const restarted=JSON.parse(fs.readFileSync(unitFile,'utf8'));const resumed=require('../lib/content-deletion.cjs')({db:restarted,directory:UNIT,save(){fs.writeFileSync(unitFile,JSON.stringify(restarted));}});resumed.cleanup();assert(!fs.existsSync(file));assert.equal(restarted.pendingMediaDeletes.length,0);assert.equal(restarted.audit[0].cleanupPending,0);
 store.audit(db.admins[0],'永久删除内容','keep');for(let i=0;i<3002;i++)store.audit(db.admins[0],'普通操作',String(i));assert(db.audit.some(e=>e.subject==='keep'));assert.equal(db.audit.filter(e=>e.action!=='永久删除内容').length,3000);
 assert(!JSON.stringify(persisted()).includes(PASSWORD));assert(!JSON.stringify(persisted()).includes(NORMAL));
 console.log('PASS: '+checks+' deletion API checks; two confirmations, own-password verification, session-bound 15-minute cache, expiry/revocation, irreversible file cleanup, reference safety, durable retry, rollback and paginated audit.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await stop();assert(path.resolve(DIR).startsWith(RUNS+path.sep));fs.rmSync(DIR,{recursive:true,force:true});}
})();
