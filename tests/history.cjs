// Windows history tool smoke test: each saved tag exports and boots in isolation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {entries,exportSource}=require('../tools/history.cjs');
const root=path.resolve(__dirname,'..');
async function request(port,route){return fetch('http://127.0.0.1:'+port+route,{signal:AbortSignal.timeout(1500)});}
async function stop(child){if(child.exitCode!==null||child.signalCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill();});}
async function main(){
 const all=entries();assert.equal(all.length,10);
 assert.throws(()=>exportSource('../main'),/未知/);
 assert.throws(()=>exportSource('v99.0.0'),/未知/);
 let count=0;
 for(const e of all){
  const {directory}=exportSource(e.ref);
  assert(!fs.existsSync(path.join(directory,'data')),'Must not copy live data');
  assert(!fs.existsSync(path.join(directory,'.env')),'Must not copy environment');
  const pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  assert.equal(pkg.version,e.version==='2.0.1'?'2.0.0':e.version||'2.0.0');
  const actual=fs.readFileSync(path.join(directory,'server.cjs'));
  const expected=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',e.commit+':server.cjs'],{cwd:root,windowsHide:true});
  assert.equal(expected.status,0);assert(actual.equals(expected.stdout),'Server must match saved commit');
  const dataDirectory=path.join(directory,'data');
  const child=spawn(process.execPath,[path.join(directory,'server.cjs')],{cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:'4284',ADMIN_PORT:'4286',EXPLORE_DATA_DIR:dataDirectory,ADMIN_PASSWORD:'HistorySmoke2026!'}});
  let output='';child.stderr.on('data',b=>{output+=b.toString();});
  try{
   let health;const end=Date.now()+12000;
   while(Date.now()<end){
    if(child.exitCode!==null)throw Error('History process exited: '+output);
    try{const r=await request(4284,'/api/health');if(r.ok){health=await r.json();break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
   }
   assert.equal(health?.app,'explore-shoot');
   const html=await request(4284,'/');assert.equal(html.status,200);assert((await html.text()).includes('探索'));
   if(e.version==='1.0.0')assert.equal((await request(4284,'/api/admin')).status,401);
   else{
    const admin=await request(4286,'/api/health');assert.equal((await admin.json()).audience,'admin');
    assert.equal((await request(4284,'/api/admin')).status,404);
   }
   assert(fs.existsSync(path.join(dataDirectory,e.version==='1.0.0'?'store.json':'store-v2.json')));
   console.log('PASS export / source / isolated boot: '+e.ref);count++;
  }finally{await stop(child);}
 }
 // Exercise the actual convenience command and its explicit quit path.
 const cli=spawn(process.execPath,[path.join(root,'tools/history.cjs'),'run','v2.1.0'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let cliOutput='';cli.stdout.on('data',b=>{cliOutput+=b.toString();});cli.stderr.on('data',b=>{cliOutput+=b.toString();});
 const cliExit=new Promise(r=>cli.once('exit',r));
 try{
  let ready=false;const end=Date.now()+12000;
  while(Date.now()<end){
   if(cli.exitCode!==null)throw Error('History CLI exited: '+cliOutput);
   try{const response=await request(4274,'/api/health');if(response.ok){ready=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert(ready,'Convenience runner must start');
  const conflict=spawnSync(process.execPath,[path.join(root,'tools/history.cjs'),'run','v2.2.0'],{cwd:root,encoding:'utf8',windowsHide:true});
  assert.equal(conflict.status,1);assert(conflict.stderr.includes('已占用'));
  cli.stdin.write('quit\n');
  const timeout=new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('History quit timed out')),5000);timer.unref();});
  assert.equal(await Promise.race([cliExit,timeout]),0);
  await assert.rejects(()=>request(4274,'/api/health'));
  await assert.rejects(()=>request(4276,'/api/health'));
  console.log('PASS convenience run / occupied port rejection / quit releases both ports');
 }finally{if(cli.exitCode===null){cli.stdin.write('quit\n');await cliExit;}}
 console.log('PASS: '+count+' historical sources; unknown refs blocked; fresh data; user/admin ports isolated.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
