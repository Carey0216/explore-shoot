const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),S=require('../lib/security.cjs'),create=require('../lib/map-settings.cjs');
const root=path.resolve(__dirname,'..'),password='TestCampus2026!',KEY='TEST1-TEST2-TEST3-TEST4-TEST5-TEST6';
function unit(){
 const admin=(id,role='super')=>({id,role,username:id,enabled:true,passwordHash:S.hashPassword(password)}),a=admin('one'),other=admin('two'),normal=admin('normal','normal'),db={admins:[a,other,normal],version:1,settings:{mapProvider:'tencent',tencentKey:KEY}},saved=[];
 const api=create({db,save:()=>saved.push(structuredClone(db.settings))}),unlock=()=>api.unlock(a,'session','ip',{username:'two',password}),grant=unlock();
 assert.equal(grant.verifiedBy,other.id);assert.throws(()=>api.unlock(normal,'session','ip',{username:'two',password}),e=>e.status===403);assert.throws(()=>api.unlock(a,'session','ip',{username:'normal',password}),e=>e.status===403);
 for(const args of [[normal,'session','ip'],[other,'session','ip'],[a,'different','ip'],[a,'session','different']])assert.throws(()=>api.read(...args,grant.token),e=>e.status===403);
 const update=input=>api.update(a,'session','ip',{...input,verification:grant.token});
 update({mapProvider:'amap',amapKey:'a'.repeat(32),amapSecurity:'b'.repeat(32),activate:false});assert.equal(db.settings.mapProvider,'tencent');assert.equal(create.publicMap(db.settings).amapKey,undefined);
 update({mapProvider:'amap',amapKey:'a'.repeat(32)});assert.deepEqual(create.publicMap(db.settings),{provider:'amap',configured:true,amapKey:'a'.repeat(32),amapProxy:true});assert(!JSON.stringify(api.read(a,'session','ip',grant.token)).includes('b'.repeat(32)));
 update({mapProvider:'baidu',baiduKey:'FixtureBaiduKey123456',activate:true});assert.equal(db.settings.tencentKey,KEY);assert.equal(db.settings.amapSecurity,'b'.repeat(32));assert.deepEqual(Object.keys(create.publicMap(db.settings)).sort(),['baiduKey','configured','provider']);
 for(const body of [{mapProvider:'evil',baiduKey:''},{mapProvider:'amap',amapKey:'bad'},{mapProvider:'baidu',baiduKey:'short'},{mapProvider:'tencent',tencentKey:KEY,secret:'extra'},{mapProvider:'amap',amapKey:'a'.repeat(32),clearAmapSecurity:true}]){const before=JSON.stringify(db);assert.throws(()=>update(body));assert.equal(JSON.stringify(db),before,'Invalid config must be atomic');}
 other.enabled=false;assert.throws(()=>api.read(a,'session','ip',grant.token));other.enabled=true;
 other.passwordHash=S.hashPassword('ChangedPassword2026!');assert.throws(()=>api.read(a,'session','ip',grant.token));other.passwordHash=S.hashPassword(password);
 const next=unlock();a.passwordHash=S.hashPassword('CurrentPassword2026!');assert.throws(()=>api.read(a,'session','ip',next.token));a.passwordHash=S.hashPassword(password);
 const expired=unlock(),now=Date.now;try{Date.now=()=>now()+180001;assert.throws(()=>api.read(a,'session','ip',expired.token));}finally{Date.now=now;}
 const locked=unlock();api.lock(locked.token);assert.throws(()=>api.read(a,'session','ip',locked.token));assert.equal(saved.length,3);
}
async function http(){
 const directory=path.join(__dirname,'.runs','config-'+Date.now()),child=require('./backend.cjs')(process.execPath,['server.cjs'],{cwd:root,windowsHide:true,env:{...process.env,PORT:'4184',ADMIN_PORT:'4186',EXPLORE_DATA_DIR:directory,ADMIN_PASSWORD:password},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);
 const req=async(audience,url,method='GET',body,cookie='',expected=200)=>{const response=await fetch('http://127.0.0.1:'+(audience==='admin'?4186:4184)+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));assert.match(response.headers.get('cache-control'),/no-store/);return {data,cookie:response.headers.getSetCookie()[0]?.split(';')[0]||cookie};};
 try{
  for(let i=0;i<150;i++){try{await req('user','/api/health');break;}catch{if(child.exitCode!==null)throw Error(errors);await new Promise(r=>setTimeout(r,100));}}
  const {cookie}=await req('admin','/api/auth/login','POST',{username:'admin',password});
  const mod=await req('admin','/api/admin/admins','POST',{username:'normal',name:'普通测试',role:'normal',password},cookie,201),normal=(await req('admin','/api/auth/login','POST',{username:'normal',password})).cookie;
  await req('admin','/api/admin/map-config/read','POST',{verification:'fake'},'',401);await req('admin','/api/admin/map-config/read','POST',{verification:'fake'},cookie,403);await req('admin','/api/admin/map-config/unlock','POST',{username:'admin',password},normal,403);
  assert.equal((await req('admin','/api/admin/overview','GET',undefined,normal)).data.settings,null);assert.equal((await req('admin','/api/admin/overview','GET',undefined,cookie)).data.settings,null);
  await req('user','/api/admin/map-config/unlock','POST',{username:'admin',password},cookie,404);
  await req('admin','/api/admin/map-config/unlock','POST',{username:'admin',password:'wrong'},cookie,403);
  const grant=(await req('admin','/api/admin/map-config/unlock','POST',{username:'admin',password},cookie)).data;
  const second=(await req('admin','/api/auth/login','POST',{username:'admin',password})).cookie;await req('admin','/api/admin/map-config/read','POST',{verification:grant.token},second,403);
  await req('admin','/api/admin/settings','PATCH',{verification:grant.token,mapProvider:'tencent',tencentKey:KEY},cookie);
  await req('admin','/api/admin/settings','PATCH',{verification:grant.token,mapProvider:'amap',amapKey:'a'.repeat(32),amapSecurity:'b'.repeat(32),activate:false},cookie);
  assert.equal((await req('user','/api/catalog')).data.map.provider,'tencent');const configured=(await req('admin','/api/admin/map-config/read','POST',{verification:grant.token},cookie)).data;assert.equal(configured.amapSecurityConfigured,true);assert(!JSON.stringify(configured).includes('b'.repeat(32)));
  assert(!JSON.stringify((await req('admin','/api/admin/overview','GET',undefined,normal)).data).includes(KEY));
  await req('user','/api/translation','POST',{pointId:'nmu1',target:'en'},'',404);await req('user','/api/translation','POST',{pointId:'nmu1',target:'en',text:'任意敏感文本'},'',400);await req('admin','/api/translation','POST',{pointId:'nmu1',target:'en'},cookie,404);
  for(const texts of [[],[''],[123],Array(41).fill('文字'),Array(3).fill('x'.repeat(3000))])await req('user','/api/translation','POST',{texts,target:'en'},'',400);
  await req('user','/api/translation','POST',{texts:['校园名称'],target:'en',url:'https://external.example'},'',400);await req('admin','/api/translation','POST',{texts:['校园名称'],target:'en'},cookie,404);
  await req('admin','/api/admin/map-config/lock','POST',{verification:grant.token},cookie);await req('admin','/api/admin/map-config/read','POST',{verification:grant.token},cookie,403);
  const file=JSON.parse(fs.readFileSync(path.join(directory,'store-v2.json'),'utf8'));assert(!file.audit.some(a=>JSON.stringify(a).includes(KEY)||JSON.stringify(a).includes('b'.repeat(32))));assert(!Object.keys(file).some(k=>/translation/i.test(k)));
 }finally{if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});}
}
(async()=>{unit();await http();console.log('PASS: SDK config requires current super role + secondary super credentials; session/IP/expiry/password/role revocation, atomic independent providers, secret redaction, locked overview, domain isolation and translation input boundaries.');})().catch(e=>{console.error(e);process.exitCode=1;});
