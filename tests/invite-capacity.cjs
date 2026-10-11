const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),testRoot=path.resolve(__dirname,'.runs'),directory=path.join(testRoot,'invite-'+Date.now()),password='CapacityTest2026!';let server;
async function start(){server=spawn(process.execPath,[path.join(root,'server.cjs')],{cwd:root,env:{...process.env,PORT:'4184',ADMIN_PORT:'4186',EXPLORE_DATA_DIR:directory,ADMIN_PASSWORD:password},windowsHide:true,stdio:'ignore'});for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4186/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Capacity test server did not start');}
async function stop(){if(server&&server.exitCode===null)await new Promise(r=>{server.once('exit',r);server.kill();});}
let cookie='';async function admin(url,method='GET',body,status=200){const response=await fetch('http://127.0.0.1:4186'+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;}
async function register(name,code){const response=await fetch('http://127.0.0.1:4184/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,nickname:name,password,inviteCode:code})});return {status:response.status,body:await response.json()};}
(async()=>{try{
 await start();await admin('/api/auth/login','POST',{username:'admin',password});
 const invite=await admin('/api/admin/invites','POST',{mode:'manual',code:'RACE26',maxUses:1,days:7},201);
 const pair=await Promise.all([register('race_one',invite.code),register('race_two',invite.code)]);assert.deepEqual(pair.map(r=>r.status).sort(),[201,400]);
 let overview=await admin('/api/admin/overview'),stored=overview.invites.find(i=>i.id===invite.id);assert.equal(stored.used,1);assert.equal(stored.usage.length,1);
 await admin('/api/admin/invites/'+invite.id,'PATCH',{maxUses:2});const loser=pair[0].status===400?'race_one':'race_two';assert.equal((await register(loser,invite.code)).status,201);
 await admin('/api/admin/invites/'+invite.id,'PATCH',{maxUses:1},400);await admin('/api/admin/invites/'+invite.id,'PATCH',{enabled:false,maxUses:3});assert.equal((await register('race_three',invite.code)).status,400);
 await admin('/api/admin/invites/'+invite.id,'PATCH',{enabled:true});assert.equal((await register('race_three',invite.code)).status,201);
 overview=await admin('/api/admin/overview');assert.equal(overview.users.length,3);assert(overview.users.every(u=>u.inviteId===invite.id&&u.scoutStatus==='approved'));stored=overview.invites.find(i=>i.id===invite.id);assert.equal(stored.used,3);assert.equal(stored.usage.length,3);
 await stop();await start();await admin('/api/admin/invites/'+invite.id,'PATCH',{maxUses:4});assert.equal((await register('race_four',invite.code)).status,201);
 console.log('Invite capacity checks passed: one winner for the last slot, immediate capacity expansion, disabling, attribution and restart persistence.');
}finally{await stop();assert(directory.startsWith(testRoot+path.sep));fs.rmSync(directory,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
