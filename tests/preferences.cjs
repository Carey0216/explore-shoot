const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const P=require('../lib/preferences.cjs'),ROOT=path.resolve(__dirname,'..'),TEMP=path.join(__dirname,'.runs'),DIR=path.join(TEMP,'preferences-'+Date.now()),PASSWORD='SettingsTest2026!';
let child,checks=0;
async function start(){child=require('./backend.cjs')(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,PORT:'4384',ADMIN_PORT:'4386',EXPLORE_DATA_DIR:DIR,ADMIN_PASSWORD:PASSWORD},windowsHide:true,stdio:'pipe'});let errors='';child.stderr.on('data',b=>errors+=b);for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(errors);try{if((await fetch('http://127.0.0.1:4386/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Settings server did not start');}
async function stop(){if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});}
function client(port){let cookie='';const request=async(url,method='GET',body,status=200,headers={})=>{const res=await fetch('http://127.0.0.1:'+port+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});for(const value of res.headers.getSetCookie())cookie=value.split(';')[0];const result=await res.json();assert.equal(res.status,status,JSON.stringify(result));checks++;return result;};request.cookie=()=>cookie;return request;}
(async()=>{try{
 await start();const admin=client(4386),a=client(4384),b=client(4384),device=client(4384),guest=client(4384);
 await guest('/api/auth/preferences','GET',undefined,401);await guest('/api/auth/preferences','PATCH',{language:'en'},401);
 await admin('/api/auth/login','POST',{username:'admin',password:PASSWORD});const invite=await admin('/api/admin/invites','POST',{days:7,maxUses:2},201);
 const alice=(await a('/api/auth/register','POST',{username:'settings_a',nickname:'甲',password:PASSWORD,inviteCode:invite.code},201)).account;
 await b('/api/auth/register','POST',{username:'settings_b',nickname:'乙',password:PASSWORD,inviteCode:invite.code},201);
 assert.deepEqual(alice.preferences,P.defaults);assert.equal(alice.preferencesRevision,0);assert(!alice.passwordHash);
 await guest('/api/auth/preferences','PATCH',{language:'en'},401,{Cookie:admin.cookie()});
 await a('/api/auth/preferences','PATCH',{language:'en'},403,{Origin:'https://other.example'});
 for(const bad of [{language:'fr'},{language:'en',role:'super'},{mapFollow:'false'},{voiceId:'unknown'},{textSize:'huge'},{motion:'full'},{},[],{id:alice.id}])await a('/api/auth/preferences','PATCH',bad,400);
 assert.deepEqual((await a('/api/auth/preferences')).preferences,P.defaults);
 const prefs={language:'en',textSize:'large',motion:'reduce',mapFollow:false,voiceId:'zhou'};
 const saved=await a('/api/auth/preferences','PATCH',prefs);assert.deepEqual(saved.preferences,prefs);assert.equal(saved.revision,1);
 const another=(await device('/api/auth/login','POST',{username:'settings_a',password:PASSWORD})).account;assert.deepEqual(another.preferences,prefs);assert.equal(another.preferencesRevision,1);
 await device('/api/auth/preferences','PATCH',{language:'ja'});assert.deepEqual((await a('/api/auth/me')).account.preferences,{...prefs,language:'ja'});
 assert.deepEqual((await b('/api/auth/preferences')).preferences,P.defaults);
 await a('/api/auth/preferences','PATCH',{language:'zh-TW'});await stop();await start();assert.deepEqual((await device('/api/auth/preferences')).preferences,{...prefs,language:'zh-TW'});
 const overview=await admin('/api/admin/overview');const audit=overview.audit.filter(x=>x.action==='修改自己的设置');assert.equal(audit.length,3);for(const x of audit){assert.equal(x.actorId,alice.id);assert(x.at);assert(x.ip);}assert(!JSON.stringify(overview.users).includes('passwordHash'));
 await admin('/api/admin/users/'+alice.id,'PATCH',{enabled:false});await a('/api/auth/preferences','PATCH',{language:'en'},401);
 assert.deepEqual((await b('/api/auth/preferences')).preferences,P.defaults);
 console.log(`PASS: ${checks} settings API checks; strict validation, own-account access, two independent sessions, partial merge, restart persistence, account isolation and audit.`);
 }finally{await stop();if(path.resolve(DIR).startsWith(path.resolve(TEMP)+path.sep))fs.rmSync(DIR,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

