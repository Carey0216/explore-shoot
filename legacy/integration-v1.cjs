const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'.test-data-'+Date.now());
const PORT=4175,base=`http://127.0.0.1:${PORT}`;let child,checks=0;
async function start(){child=spawn(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,PORT:String(PORT),EXPLORE_DATA_DIR:DIR},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',c=>reject(Error('Server exit '+c)));child.stderr.once('data',b=>reject(Error(b.toString())));});}
async function stop(){if(!child||child.exitCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill();});}
function client(){let cookie={};return async(url,method='GET',body,status=200,extra={})=>{const r=await fetch(base+url,{method,headers:{Cookie:Object.entries(cookie).map(([k,v])=>`${k}=${v}`).join('; '),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],at=pair.indexOf('=');cookie[pair.slice(0,at)]=pair.slice(at+1);}const raw=await r.text();assert.equal(r.status,status,raw);checks++;return r.headers.get('content-type')?.includes('json')?JSON.parse(raw):raw;};}
(async()=>{try{await start();const user=client(),other=client(),admin=client();
const cat=await user('/api/catalog');assert.equal(cat.points.length,8);assert.equal(cat.templates.length,16);assert.equal(cat.routes.length,3);
await user('/api/admin','GET',null,401);await user('/api/admin/points/p1','PATCH',{open:false},401);
await admin('/api/login','POST',{username:'admin',password:'wrong'},401);await admin('/api/login','POST',{username:'admin',password:process.env.ADMIN_PASSWORD||'Explore2026!'});
const pref={budget:15,people:2,intensity:'轻松',theme:'建筑',mode:'personal'};
const routes=await user('/api/plan','POST',pref);assert.equal(routes.find(r=>r.id==='r1').total,15);assert(routes.find(r=>r.id==='r1').available);assert(!routes.find(r=>r.id==='r3').available);
await user('/api/plan','POST',{...pref,budget:999},400);
await user('/api/sessions','POST',{routeId:'r3',preferences:pref},409);
let s=await user('/api/sessions','POST',{routeId:'r1',preferences:pref},201);assert(s.generation.includes('回退'));assert.equal(s.tasks[0].steps.length,4);
let repeat=await user('/api/sessions','POST',{routeId:'r1',preferences:pref});assert.equal(repeat.id,s.id);
assert.equal((await other('/api/sessions')).length,0);await other('/api/sessions/'+s.id+'/export','GET',null,404);await other('/api/sessions/'+s.id,'PATCH',{action:'pause'},404);
await user('/api/sessions/'+s.id,'PATCH',{action:'pause'},403,{Origin:'http://evil.example'});
await user('/api/sessions/'+s.id,'PATCH',{action:'finish'},400);
await user('/api/sessions/'+s.id,'PATCH',{action:'pause'});await user('/api/sessions/'+s.id,'PATCH',{action:'task',taskId:s.tasks[0].id,status:'done'},400);
await user('/api/sessions/'+s.id,'PATCH',{action:'resume'});
await admin('/api/admin/points/p1','PATCH',{open:false});assert.deepEqual((await user('/api/sessions'))[0].blocked,['图书馆前庭']);await user('/api/sessions/'+s.id,'PATCH',{action:'task',taskId:s.tasks[0].id,status:'done'},409);
await admin('/api/admin/points/p1','PATCH',{open:true});
await user('/api/sessions/'+s.id,'PATCH',{action:'task',taskId:s.tasks[0].id,status:'done'});
await user('/api/sessions/'+s.id,'PATCH',{action:'task',taskId:s.tasks[1].id,status:'skipped',reason:''},400);
await user('/api/sessions/'+s.id,'PATCH',{action:'task',taskId:s.tasks[1].id,status:'skipped',reason:'测试：时间不足'});
await user('/api/sessions/'+s.id,'PATCH',{action:'photo',taskId:s.tasks[0].id,photo:'data:image/svg+xml;base64,AA=='},400);
const jpg=fs.readFileSync(path.join(ROOT,'dist/assets/campus.jpg'));const metadata=Buffer.from('GPS TEST');const segment=Buffer.concat([Buffer.from([255,225,0,metadata.length+2]),metadata]);const marked=Buffer.concat([jpg.subarray(0,2),segment,jpg.subarray(2)]);
s=await user('/api/sessions/'+s.id,'PATCH',{action:'photo',taskId:s.tasks[0].id,photo:'data:image/jpeg;base64,'+marked.toString('base64')});assert(!Buffer.from(s.tasks[0].photo.split(',')[1],'base64').includes(metadata));
const admindata=await admin('/api/admin');assert(!JSON.stringify(admindata).includes('data:image'));assert(!('owner'in admindata.sessions[0]));
await user('/api/sessions/'+s.id,'PATCH',{action:'task',taskId:s.tasks[2].id,status:'done'});s=await user('/api/sessions/'+s.id,'PATCH',{action:'finish'});assert.equal(s.status,'completed');
await user('/api/sessions/'+s.id,'PATCH',{action:'feedback',feedback:'<script>alert(1)</script> 测试感受',rating:4});const html=await user('/api/sessions/'+s.id+'/export');assert(html.includes('&lt;script&gt;'));assert(html.includes('data:image/jpeg;base64,'));
await stop();await start();s=(await user('/api/sessions'))[0];assert.equal(s.rating,4);assert(s.tasks[0].photo);await admin('/api/admin','GET',null,401);await admin('/api/login','POST',{username:'admin',password:process.env.ADMIN_PASSWORD||'Explore2026!'});
await admin('/api/admin/templates/t1','PATCH',{approved:false});await admin('/api/admin/templates/t2','PATCH',{approved:false});const blocked=await user('/api/plan','POST',pref);assert(!blocked.find(r=>r.id==='r1').available);
await admin('/api/admin/templates/t1','PATCH',{approved:true});await admin('/api/admin/routes/r1','PATCH',{timing:6.2});assert.equal((await admin('/api/admin')).routes[0].timings.length,1);
await user('/api/sessions/'+s.id,'DELETE');assert.equal((await user('/api/sessions')).length,0);assert(!fs.readFileSync(path.join(DIR,'store.json'),'utf8').includes('data:image'));
console.log(`PASS: ${checks} API checks; budget / fallback / idempotency / permission / closed point / pause / upload metadata / private photos / export XSS / restart persistence / review / delete.`);
}finally{await stop();if(DIR.startsWith(ROOT+path.sep+'.test-data-'))fs.rmSync(DIR,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
