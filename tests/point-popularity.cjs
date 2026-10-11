const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const P=require('../lib/point-popularity.cjs'),ROOT=path.resolve(__dirname,'..'),DIR=path.join(__dirname,'.runs','popularity-'+Date.now()),PASSWORD='PopularityTest2026!';
let child,checks=0;
async function start(){child=require('./backend.cjs')(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,PORT:'4194',ADMIN_PORT:'4196',EXPLORE_DATA_DIR:DIR,ADMIN_PASSWORD:PASSWORD,EXPLORE_VOICE_WARMUP:'0'},windowsHide:true,stdio:'pipe'});let errors='';child.stderr.on('data',b=>errors+=b);for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(errors);try{if((await fetch('http://127.0.0.1:4196/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Popularity server did not start');}
async function stop(){if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});}
function client(port){let cookie='';return async(url,method='GET',body,status=200)=>{const result=await fetch('http://127.0.0.1:'+port+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const value of result.headers.getSetCookie())cookie=value.split(';')[0];const buffer=Buffer.from(await result.arrayBuffer());assert.equal(result.status,status,buffer.toString().slice(0,180));checks++;return JSON.parse(buffer);};}
(async()=>{try{
 const point={id:'x'},counter=P.counter(),visitor=randomUUID();
 assert.deepEqual(P.stats(point),{viewCount:0,popularity:0,popularityAdjusted:false});
 assert.throws(()=>counter.record(point,visitor,()=>{throw Error('disk');},0),/disk/);assert(!Object.hasOwn(point,'viewCount'));
 assert(counter.record(point,visitor,()=>{},0).counted);assert.equal(counter.record(point,visitor,()=>{},P.WINDOW-1).counted,false);assert(counter.record(point,visitor,()=>{},P.WINDOW).counted);
 assert.equal(P.adjustment(point,{popularity:30}),28);assert.equal(P.adjustment(point,{useActual:true}),0);assert.throws(()=>P.adjustment(point,{popularity:1,useActual:true}));
 await start();const admin=client(4196),normal=client(4196),guest=client(4194);
 await admin('/api/auth/login','POST',{username:'admin',password:PASSWORD});
 await admin('/api/admin/admins','POST',{username:'popularity_mod',name:'普通管理员',role:'normal',password:PASSWORD},201);
 await normal('/api/auth/login','POST',{username:'popularity_mod',password:PASSWORD});
 const catalog=await guest('/api/catalog'),id=catalog.points[0].id,id2=catalog.points[1].id,url='/api/points/'+id+'/view',adjust='/api/admin/points/'+id+'/popularity';
 const hidden=p=>{for(const key of ['viewCount','popularity','popularityOffset','popularityAdjusted'])assert(!Object.hasOwn(p,key),'Private metric leaked: '+key);};catalog.points.forEach(hidden);assert.deepEqual(catalog.popularPointIds,catalog.points.map(p=>p.id));
 await guest(adjust,'PATCH',{popularity:100},404);await client(4196)(adjust,'PATCH',{popularity:100},401);await normal(adjust,'PATCH',{popularity:100},403);
 await guest(url,'POST',{clientId:'invalid'},400);await guest(url,'POST',{clientId:randomUUID(),viewCount:100},400);
 await guest('/api/points/not-found/view','POST',{clientId:randomUUID()},404);await admin(url,'POST',{clientId:randomUUID()},404);
 const first=await guest(url,'POST',{clientId:visitor});assert.deepEqual(first,{ok:true});assert.equal((await admin('/api/admin/overview')).points.find(p=>p.id===id).viewCount,1);
 const repeat=await guest(url,'POST',{clientId:visitor});assert.deepEqual(repeat,{ok:true});assert.equal((await admin('/api/admin/overview')).points.find(p=>p.id===id).viewCount,1);
 await guest('/api/points/'+id2+'/view','POST',{clientId:visitor});
 assert.equal((await guest('/api/catalog')).version,catalog.version,'Views never force active forms and maps to rerender');
 for(const value of [-1,1.2,1_000_000_001,'2',null])await admin(adjust,'PATCH',{popularity:value},400);
 await admin(adjust,'PATCH',{popularity:22,useActual:true},400);
 const adjusted=await admin(adjust,'PATCH',{popularity:22});assert.equal(adjusted.viewCount,1);assert.equal(adjusted.popularity,22);assert(adjusted.popularityAdjusted);
 const next=await guest(url,'POST',{clientId:randomUUID()});assert.deepEqual(next,{ok:true});assert.equal((await admin('/api/admin/overview')).points.find(p=>p.id===id).popularity,23);
 hidden(await normal('/api/admin/points/'+id,'PATCH',{viewCount:999,popularityOffset:999}));assert.equal((await admin('/api/admin/overview')).points.find(p=>p.id===id).popularity,23,'Regular editing cannot spoof counters');const publicCatalog=await guest('/api/catalog');publicCatalog.points.forEach(hidden);assert.equal(publicCatalog.popularPointIds[0],id);const ordinary=await normal('/api/admin/overview');ordinary.points.forEach(hidden);assert.equal(ordinary.audit.find(e=>e.action==='调整机位热度').detail,'热度详情仅超级管理员可见');const paged=await normal('/api/admin/audit');assert.equal(paged.events.find(e=>e.action==='调整机位热度').detail,'热度详情仅超级管理员可见');
 const overview=await admin('/api/admin/overview'),event=overview.audit.find(e=>e.action==='调整机位热度');assert(event);assert(event.ip);assert(event.at);assert.equal(event.actorRole,'super');assert(event.actorName);assert.match(event.detail,/实际详情浏览 1/);
 await admin('/api/admin/points/'+id,'PATCH',{published:false});await guest(url,'POST',{clientId:randomUUID()},404);assert(!(await guest('/api/catalog')).points.some(p=>p.id===id));
 await stop();await start();await admin('/api/auth/login','POST',{username:'admin',password:PASSWORD});const restored=(await admin('/api/admin/overview')).points.find(p=>p.id===id);assert.equal(restored.viewCount,2);assert.equal(restored.popularity,23,'Aggregate statistics and adjustments survive restart');
 const reset=await admin(adjust,'PATCH',{useActual:true});assert.equal(reset.popularity,2);assert.equal(reset.popularityAdjusted,false);
 const model=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(ROOT,'dist/user/checkin-model.js')).toString('base64'));
 const points=[{id:'a',name:'图书馆',popularity:1},{id:'b',name:'草地',popularity:8},{id:'c',name:'图书馆南侧',popularity:5}];
 assert.deepEqual(model.selectPlaces(points,[],{filter:'popular',popularOrder:['b','c','a']}).map(p=>p.id),['b','c','a']);assert.deepEqual(model.selectPlaces(points,[],{filter:'popular',popularOrder:['b','c','a'],query:'图书馆'}).map(p=>p.id),['c','a']);
 const outings=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(ROOT,'dist/user/outings.js'),'utf8').replace(/^import .*;\r?\n/gm,'const icon=()=>"";\n')).toString('base64'));
 assert.deepEqual(outings.mobileItems.map(i=>i[2]),['发现','机位','出行','我的']);assert.equal(outings.mobileItems[2][0],'map');for(const page of ['map','navigate','routes','active'])assert(outings.navSelected('map',page));assert(!outings.navSelected('discover','shots'));assert(outings.navSelected('shots','place'));assert.equal((outings.outingTabs('map').match(/<a /g)||[]).length,3);assert.equal(outings.outingTabs('me'),'');
 console.log('Popularity and outing checks passed: '+checks+' API requests; dedupe, rollback, permissions, audit, persistence, hidden points, filters and four destinations.');
 }finally{await stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
