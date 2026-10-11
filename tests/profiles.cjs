const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),TEMP=path.resolve(__dirname,'.runs'),DIR=path.join(TEMP,'profiles-'+Date.now()),PASSWORD='ProfileTest2026!';
let processHandle,checks=0;
async function start(){
 processHandle=require('./backend.cjs')(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,PORT:'4184',ADMIN_PORT:'4186',EXPLORE_DATA_DIR:DIR,ADMIN_PASSWORD:PASSWORD},windowsHide:true,stdio:'pipe'});
 let errors='';processHandle.stderr.on('data',b=>errors+=b);
 for(let n=0;n<50;n++){if(processHandle.exitCode!==null)throw Error(errors);try{if((await fetch('http://127.0.0.1:4186/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Profile server did not start');
}
async function stop(){if(processHandle&&processHandle.exitCode===null)await new Promise(r=>{processHandle.once('exit',r);processHandle.kill();});}
function client(port){let cookie='';const request=async(url,method='GET',body,status=200,headers={})=>{
 const result=await fetch('http://127.0.0.1:'+port+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 for(const value of result.headers.getSetCookie())cookie=value.split(';')[0];
 const buffer=Buffer.from(await result.arrayBuffer());assert.equal(result.status,status,buffer.toString().slice(0,200));checks++;
 return (result.headers.get('content-type')||'').includes('json')?JSON.parse(buffer):buffer;
 };request.cookie=()=>cookie;return request;
}
(async()=>{try{
 await start();const root=client(4186),normal=client(4186),alice=client(4184),bob=client(4184),guest=client(4184);
 await guest('/api/auth/profile','PATCH',{nickname:'匿名'},401);await guest('/api/auth/avatar','GET',undefined,401);
 const admin=(await root('/api/auth/login','POST',{username:'admin',password:PASSWORD})).account;
 const invitation=await root('/api/admin/invites','POST',{days:7,maxUses:2},201);
 const a=(await alice('/api/auth/register','POST',{username:'profile_a',nickname:'甲',password:PASSWORD,inviteCode:invitation.code},201)).account;
 const b=(await bob('/api/auth/register','POST',{username:'profile_b',nickname:'乙',password:PASSWORD,inviteCode:invitation.code},201)).account;
 const moderator=await root('/api/admin/admins','POST',{username:'profile_mod',name:'普通管理员',password:PASSWORD,role:'normal'},201);await normal('/api/auth/login','POST',{username:'profile_mod',password:PASSWORD});
 const jpeg=fs.readFileSync(path.join(ROOT,'dist/shared/nmu-library.jpg')),secret=Buffer.from('AVATAR EXIF GPS PRIVATE'),extra=Buffer.concat([Buffer.from([255,225,0,secret.length+2]),secret]);
 const avatar='data:image/jpeg;base64,'+Buffer.concat([jpeg.subarray(0,2),extra,jpeg.subarray(2)]).toString('base64');
 await alice('/api/auth/profile','PATCH',{nickname:''},400);await alice('/api/auth/profile','PATCH',{nickname:'甲'.repeat(25)},400);await alice('/api/auth/profile','PATCH',{nickname:'非法\n昵称'},400);
 await alice('/api/auth/profile','PATCH',{nickname:'不能保存',avatar:'data:image/svg+xml;base64,AA=='},400);assert.equal((await alice('/api/auth/me')).account.nickname,'甲');
 await bob('/api/auth/profile','PATCH',{id:a.id,nickname:'越权'},400);await bob('/api/auth/profile','PATCH',{role:'super'},400);await bob('/api/auth/profile','PATCH',{avatar:'data:image/jpeg;base64,AA=='},400);await bob('/api/auth/profile','PATCH',{},400);
 await root('/api/admin/users/'+a.id,'PATCH',{scoutStatus:'approved'});
 await alice('/api/auth/login','POST',{username:'profile_a',password:PASSWORD});
 const cat=await guest('/api/catalog'),coordinate=cat.points[0];const media=await alice('/api/media','POST',{photo:avatar},201);
 const point=await alice('/api/points','POST',{name:'资料测试点位',description:'测试资料更新后的共创署名',condition:'公共区域测试',theme:'建筑',lng:coordinate.lng,lat:coordinate.lat,mediaId:media.id},201);
 const updated=(await alice('/api/auth/profile','PATCH',{nickname:' 校园摄影者 ',avatar})).account;assert.equal(updated.nickname,'校园摄影者');assert.equal(updated.username,'profile_a');assert.equal(updated.scoutStatus,'approved');assert.equal(updated.inviteId,invitation.id);assert(!updated.passwordHash);assert(updated.hasAvatar);assert.equal(updated.avatarVersion,1);
 assert.equal((await guest('/api/catalog')).points.find(p=>p.id===point.id).authorName,'校园摄影者');assert((await guest('/api/catalog')).version>cat.version);
 assert(!(await alice('/api/auth/avatar')).includes(secret));await bob('/api/auth/avatar','GET',undefined,404);await root('/api/auth/avatar','GET',undefined,404);await guest('/api/auth/avatar','GET',undefined,401,{Cookie:root.cookie()});
 const originalBytes=await alice('/api/auth/avatar');assert.deepEqual(await alice('/api/auth/avatar?userId='+b.id),originalBytes);
 await alice('/api/auth/profile','PATCH',{nickname:'第二次昵称'});assert.equal((await alice('/api/auth/me')).account.avatarVersion,1);assert.deepEqual(await alice('/api/auth/avatar'),originalBytes);
 await alice('/api/auth/profile','PATCH',{avatar:null});assert.equal((await alice('/api/auth/me')).account.hasAvatar,false);await alice('/api/auth/avatar','GET',undefined,404);
 await alice('/api/auth/profile','PATCH',{avatar});assert.equal((await alice('/api/auth/me')).account.avatarVersion,3);
 await root('/api/auth/profile','PATCH',{nickname:'超管自己的昵称',avatar});assert.equal((await root('/api/auth/me')).account.name,'超管自己的昵称');assert.equal((await root('/api/auth/me')).account.role,'super');assert(!(await root('/api/auth/avatar')).includes(secret));
 await normal('/api/auth/profile','PATCH',{nickname:'普通管理员新昵称',avatar});assert.equal((await normal('/api/auth/me')).account.role,'normal');await normal('/api/admin/admins/'+admin.id,'PATCH',{role:'normal'},403);await normal('/api/auth/profile','PATCH',{id:admin.id,nickname:'越权管理员'},400);
 await root('/api/auth/profile','PATCH',{nickname:'超'.repeat(31)},400);await root('/api/auth/profile','PATCH',{avatar:'data:image/jpeg;base64,'+Buffer.alloc(1024*1024+1).toString('base64')},400);
 await stop();await start();assert.equal((await alice('/api/auth/me')).account.nickname,'第二次昵称');assert.deepEqual(await alice('/api/auth/avatar'),originalBytes);assert.equal((await root('/api/auth/me')).account.name,'超管自己的昵称');assert((await normal('/api/auth/me')).account.hasAvatar);
 await root('/api/admin/users/'+a.id,'PATCH',{enabled:false});await alice('/api/auth/avatar','GET',undefined,401);await alice('/api/auth/profile','PATCH',{nickname:'停用账号'},401);
 assert.equal((await bob('/api/auth/me')).account.nickname,'乙');assert.equal((await normal('/api/auth/me')).account.id,moderator.id);
 console.log(`PASS: ${checks} profile checks; self-only updates, role preservation, private avatars, metadata stripping, atomic validation, author names and persistence.`);
 }finally{await stop();if(DIR.startsWith(TEMP+path.sep))fs.rmSync(DIR,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
