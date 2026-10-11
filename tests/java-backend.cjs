// Actual Java integration: no HTTP forwarding to the historical Node implementation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,stop}=require('../tools/backend-process.cjs'),S=require('../lib/security.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(__dirname,'.runs','java-'+Date.now()),password='JavaContract2026!';
const child=launch(root,{env:{...process.env,PORT:'4484',ADMIN_PORT:'4486',EXPLORE_DATA_DIR:dir,ADMIN_PASSWORD:password,EXPLORE_VOICE_WARMUP:'0'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.stdout.on('data',()=>{});
async function request(route,method='GET',body,status=200){const r=await fetch('http://127.0.0.1:4484'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;}
(async()=>{try{
 let health;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(errors);try{health=await request('/api/health');break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal(health.backend,'java');assert.equal(health.release,require('../package.json').version);
 const member=await request('/api/auth/register','POST',{username:'java_fixture',nickname:'Java 测试用户',password,role:'super'},201);assert.equal(member.account.scoutStatus,'none');
 const db=JSON.parse(fs.readFileSync(path.join(dir,'store-v2.json'),'utf8'));assert(S.verifyPassword(password,db.users[0].passwordHash),'Historical Node scrypt verification must accept new Java passwords.');
 const voices=await request('/api/navigation/voices');assert.equal(voices.voices.length,6);assert(voices.voices.some(v=>v.gender==='女声')&&voices.voices.some(v=>v.gender==='男声'));
 await request('/api/navigation/speech','POST',{voice:'invalid',text:'测试'},400);await request('/api/translation','POST',{texts:[],target:'en'},400);await request('/api/translation','POST',{texts:['x'],target:'evil'},400);
 const exported=JSON.parse(fs.readFileSync('backend/src/main/resources/campus-seed.json','utf8'));const catalog=await request('/api/catalog');assert.deepEqual(catalog.points.map(p=>p.name),exported.points.map(p=>p.name));
 assert.equal((await fetch('http://127.0.0.1:4484/shared/ui.js')).status,200);assert.equal((await fetch('http://127.0.0.1:4484/backend/pom.xml')).status,404);
 console.log('PASS actual Java backend: JVM health, cross-language password compatibility, registration, six voices, translation boundaries, seed catalog and source isolation.');
}finally{stop(child);}})().catch(e=>{console.error(e);process.exitCode=1;});
