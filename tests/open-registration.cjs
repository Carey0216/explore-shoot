const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(__dirname,'.runs','registration-'+Date.now()),PASSWORD='Registration2026!';let child,checks=0;
async function start(){child=spawn(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,PORT:'4194',ADMIN_PORT:'4196',EXPLORE_DATA_DIR:DIR,ADMIN_PASSWORD:PASSWORD,EXPLORE_VOICE_WARMUP:'0'},windowsHide:true,stdio:'ignore'});for(let i=0;i<70;i++){try{if((await fetch('http://127.0.0.1:4196/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Registration server not ready');}
async function stop(){if(child?.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});}
function client(port){let cookie='';return async(url,method='GET',body,status=200)=>{const response=await fetch('http://127.0.0.1:'+port+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const value of response.headers.getSetCookie())cookie=value.split(';')[0];const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));checks++;return result;};}
const registration=(username,extra={})=>({username,nickname:'注册测试',password:PASSWORD,...extra});
(async()=>{try{
 await start();const admin=client(4196),ordinary=client(4194),empty=client(4194),invited=client(4194),guest=client(4194);
 await admin('/api/auth/login','POST',{username:'admin',password:PASSWORD});
 const invite=await admin('/api/admin/invites','POST',{mode:'manual',code:'OPEN26',maxUses:1,days:7},201);
 const regular=(await ordinary('/api/auth/register','POST',registration('open_member',{scoutStatus:'approved',role:'super'}),201)).account;
 assert.equal(regular.scoutStatus,'none');assert.equal(regular.inviteId,null);assert.equal(regular.registrationMethod,'open');assert(!regular.role);assert(!regular.passwordHash);
 const blank=(await empty('/api/auth/register','POST',registration('blank_member',{inviteCode:'   '}),201)).account;assert.equal(blank.scoutStatus,'none');
 assert.equal((await admin('/api/admin/overview')).invites.find(i=>i.id===invite.id).used,0);
 await ordinary('/api/points','POST',{},403);const application=await ordinary('/api/scout/apply','POST',{reason:'希望贡献真实校园拍摄点位'},201);assert.equal((await ordinary('/api/auth/me')).account.scoutStatus,'pending');
 await admin('/api/admin/applications/'+application.id,'PATCH',{status:'approved'});assert.equal((await ordinary('/api/auth/me')).account.scoutStatus,'approved');
 const scout=(await invited('/api/auth/register','POST',registration('invited_member',{inviteCode:' open26 '}),201)).account;assert.equal(scout.scoutStatus,'approved');assert.equal(scout.inviteId,invite.id);
 await invited('/api/scout/apply','POST',{reason:'无需重复申请探索官'},400);
 const jpg=fs.readFileSync(path.join(ROOT,'dist/shared/nmu-library.jpg')).toString('base64'),media=await invited('/api/media','POST',{photo:'data:image/jpeg;base64,'+jpg},201),draft={name:'隔离共创点位',description:'验证作者本人也不能读取浏览量',condition:'仅公共开放区域',theme:'建筑',lng:106.10244,lat:38.49462,mediaId:media.id,submissionId:crypto.randomUUID()};
 const point=await invited('/api/points','POST',draft,201);await guest('/api/points/'+point.id+'/view','POST',{clientId:crypto.randomUUID()});const replay=await invited('/api/points','POST',draft),mine=await invited('/api/my/community');for(const item of [point,replay,...mine.points])for(const key of ['viewCount','popularity','popularityOffset','popularityAdjusted'])assert(!Object.hasOwn(item,key),'Author response leaked '+key);
await invited('/api/reports','POST',{pointId:'nmu1',description:'注册权限测试，请核对现场入口'},201);
 await guest('/api/auth/register','POST',registration('bad_code',{inviteCode:'NOTVALID'}),400);
 await guest('/api/auth/register','POST',registration('full_code',{inviteCode:'OPEN26'}),400);
 await guest('/api/auth/register','POST',registration('bad_type',{inviteCode:123456}),400);
 await guest('/api/auth/register','POST',registration('long_code',{inviteCode:'A'.repeat(31)}),400);
 let overview=await admin('/api/admin/overview');assert.equal(overview.users.length,3);assert.equal(overview.invites.find(i=>i.id===invite.id).used,1);assert.equal(overview.invites.find(i=>i.id===invite.id).usage[0].userId,scout.id);assert(overview.audit.some(e=>e.action==='公开注册'&&e.subject===regular.id));assert(overview.audit.some(e=>e.action==='邀请码注册'&&e.subject===invite.id));
 await stop();await start();await admin('/api/auth/login','POST',{username:'admin',password:PASSWORD});
 const disabled=await admin('/api/admin/invites','POST',{days:1,maxUses:1},201);await admin('/api/admin/invites/'+disabled.id,'PATCH',{enabled:false});await guest('/api/auth/register','POST',registration('disabled_code',{inviteCode:disabled.code}),400);
 await guest('/api/auth/register','POST',registration('open_member'),400);
 assert.equal((await empty('/api/auth/me')).account.scoutStatus,'none','Existing ordinary accounts are never retroactively promoted');assert.equal((await invited('/api/auth/me')).account.scoutStatus,'approved');
 // An expired invite and an existing pre-upgrade invited account remain unchanged.
 await stop();const file=path.join(DIR,'store-v2.json'),db=JSON.parse(fs.readFileSync(file));db.invites.find(i=>i.id===disabled.id).enabled=true;db.invites.find(i=>i.id===disabled.id).expiresAt='2000-01-01T00:00:00Z';db.users.find(u=>u.id===blank.id).inviteId=disabled.id;fs.writeFileSync(file,JSON.stringify(db));await start();
 await guest('/api/auth/register','POST',registration('expired_code',{inviteCode:disabled.code}),400);assert.equal((await empty('/api/auth/me')).account.scoutStatus,'none');
 await guest('/api/auth/register','POST',registration('without_invite',{inviteCode:''}),201);
 const auth=fs.readFileSync(path.join(ROOT,'dist/shared/auth.js'),'utf8');assert(!/field\('邀请码[^']*','inviteCode','text','','required/.test(auth));assert(auth.includes('邀请码（选填）'));
 console.log('Open registration passed: '+checks+' API requests; optional code, direct scout access, invalid/full/disabled/expired rejection, application, attribution, restart and existing-account preservation.');
 }finally{await stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
