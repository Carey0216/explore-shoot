const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),TEMP=path.join(__dirname,'.runs'),DIR=path.join(TEMP,'checkins-'+Date.now()),PASSWORD='CheckinTest2026!';
let child,checks=0;
async function start(){child=spawn(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,PORT:'4184',ADMIN_PORT:'4186',EXPLORE_DATA_DIR:DIR,ADMIN_PASSWORD:PASSWORD,EXPLORE_VOICE_WARMUP:'0'},windowsHide:true,stdio:'pipe'});let errors='';child.stderr.on('data',b=>errors+=b);for(let i=0;i<70;i++){if(child.exitCode!==null)throw Error(errors);try{if((await fetch('http://127.0.0.1:4186/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Checkin server did not start');}
async function stop(){if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});}
function client(port){let cookie='';return async(url,method='GET',body,status=200)=>{const result=await fetch('http://127.0.0.1:'+port+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const value of result.headers.getSetCookie())cookie=value.split(';')[0];const buffer=Buffer.from(await result.arrayBuffer());assert.equal(result.status,status,buffer.toString().slice(0,180));checks++;return(result.headers.get('content-type')||'').includes('json')?JSON.parse(buffer):buffer;};}
(async()=>{try{
 await start();const admin=client(4186),alice=client(4184),bob=client(4184),guest=client(4184);
 await admin('/api/auth/login','POST',{username:'admin',password:PASSWORD});const invite=await admin('/api/admin/invites','POST',{days:7,maxUses:2},201);
 const a=(await alice('/api/auth/register','POST',{username:'checkin_a',nickname:'甲',password:PASSWORD,inviteCode:invite.code},201)).account;
 await bob('/api/auth/register','POST',{username:'checkin_b',nickname:'乙',password:PASSWORD,inviteCode:invite.code},201);
 const catalog=await guest('/api/catalog'),point=catalog.points[0],template=catalog.templates.find(t=>t.pointId===point.id);
 const data={submissionId:randomUUID(),pointId:point.id,note:'图书馆前今天的阳光很漂亮',templateId:template.id};
 await guest('/api/checkins','GET',undefined,401);await guest('/api/checkins','POST',data,401);await admin('/api/checkins','GET',undefined,404);
 await alice('/api/checkins','POST',{...data,accountId:'other'},403);await alice('/api/checkins','POST',{...data,note:{}},400);await alice('/api/checkins','POST',{...data,submissionId:'invalid'},400);await alice('/api/checkins','POST',{...data,note:''},400);
 await alice('/api/checkins','POST',{...data,pointId:'missing'},409);await alice('/api/checkins','POST',{...data,templateId:'missing'},409);
 await alice('/api/checkins','POST',{...data,location:{lng:point.lng,lat:point.lat,at:Date.now()-60000,accuracy:5}},400);
 await alice('/api/checkins','POST',{...data,location:{lng:point.lng,lat:point.lat,at:Date.now(),accuracy:100}},400);
 const photo='data:image/jpeg;base64,'+fs.readFileSync(path.join(ROOT,'dist/shared/nmu-library.jpg')).toString('base64');
 const bmedia=await bob('/api/media','POST',{photo},201);await alice('/api/checkins','POST',{...data,mediaId:bmedia.id},403);
 const media=await alice('/api/media','POST',{photo},201);
 const first=await alice('/api/checkins','POST',{...data,mediaId:media.id,location:{lng:point.lng,lat:point.lat,at:Date.now(),accuracy:7}},201);
 assert.equal(first.ownerId,a.id);assert.equal(first.location.nearby,true);assert.equal(first.location.distance,0);assert(!('lng' in first.location));
 assert.equal((await alice('/api/checkins','POST',{...data,note:'retry altered body'})).id,first.id);assert.equal((await alice('/api/checkins')).length,1);assert.deepEqual(await bob('/api/checkins'),[]);
 await guest('/media/'+media.id,'GET',undefined,404);await bob('/media/'+media.id,'GET',undefined,404);await admin('/media/'+media.id,'GET',undefined,404);await alice('/media/'+media.id);
 await bob('/api/checkins/'+first.id,'DELETE',undefined,404);
 const session=await alice('/api/sessions','POST',{routeId:'nroute1',preferences:{budget:30,people:1,intensity:'轻松',theme:'全部',mode:'fixed'}},201);
 await alice('/api/sessions/'+session.id,'PATCH',{action:'photo',taskId:session.tasks[0].id,mediaId:media.id});
 await alice('/api/sessions/'+session.id,'DELETE');await alice('/media/'+media.id); // a check-in still references it
 await admin('/api/admin/points/'+point.id,'PATCH',{name:'后来改名的地点',open:false});
 await alice('/api/checkins','POST',{...data,submissionId:randomUUID()},409);assert.equal((await alice('/api/checkins'))[0].pointName,point.name);
 assert.equal((await alice('/api/checkins','POST',data)).id,first.id); // a lost success response can be retried even after closure
 const disk=JSON.parse(fs.readFileSync(path.join(DIR,'store-v2.json'),'utf8'));assert(!JSON.stringify(disk.checkins).includes('longitude'));assert(!('checkins' in await admin('/api/admin/overview')));
 await stop();await start();assert.equal((await alice('/api/checkins')).length,1);
 await alice('/api/checkins/'+first.id,'DELETE');await alice('/media/'+media.id,'GET',undefined,404);assert.deepEqual(await alice('/api/checkins'),[]);
 // Aggregate legacy task completions without counting skipped or pending tasks, or merging repeat visits.
 const model=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(ROOT,'dist/user/checkin-model.js')).toString('base64'));
 const sessions=[{id:'s',createdAt:'2026-10-01',tasks:[{id:'t1',pointId:point.id,pointName:'旧名称',status:'done',mediaId:'photo'},{id:'t2',pointId:'skip',status:'skipped'},{id:'t3',pointId:'pending',status:'pending'}]}];
 const records=model.visits([first],sessions),summary=model.passport(records,catalog.points);
 assert.equal(records.length,2);assert.equal(summary.unique,1);assert.equal(summary.photos,2);assert.equal(summary.current,1);assert.equal(model.passport(records,[]).unique,1);
 assert(model.selectPlaces(catalog.points,catalog.templates,{query:template.title}).some(p=>p.id===point.id));
 assert.equal(model.selectPlaces(catalog.points,[],{filter:'saved',bookmarks:[point.id]}).length,1);
 assert.equal(model.selectPlaces(catalog.points,[],{filter:'visited',visited:summary.ids}).length,1);
 assert(!model.selectPlaces(catalog.points,[],{filter:'unvisited',visited:summary.ids}).some(p=>p.id===point.id));
 assert.equal(model.selectPlaces(catalog.points,[],{filter:'nearby',location:point})[0].id,point.id);
 // Permanent catalogue deletion preserves a private check-in reference and photo.
 const deletion=require('../lib/content-deletion.cjs');const tempdb={points:[{...point,published:false,mediaId:media.id}],templates:[],routes:[],reports:[],sessions:[],checkins:[first],media:[{id:media.id,public:true}],users:[],audit:[],version:1};
 const plan=deletion({db:tempdb,save(){},directory:DIR}).preview('points',point.id);assert.equal(plan.result.preservedPhotos,1);assert.equal(plan.result.deletedPhotos,0);
 console.log(`PASS: ${checks} check-in API checks plus legacy aggregation, sorting, optional freshness, immutable names, idempotency, persistence, cross-owner privacy and referenced-photo preservation.`);
 }finally{await stop();if(DIR.startsWith(TEMP+path.sep))fs.rmSync(DIR,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
