const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const Voice=require('../lib/navigation-voice.cjs');
const dir=path.join(__dirname,'.runs','voice-warmup-'+Date.now());
const wav=Buffer.alloc(48);wav.write('RIFF');wav.write('WAVE',8);wav.write('fmt ',12);
function engine({hold=false}={}){
 const generated=[],held=[];let starts=0;
 const spawnWorker=()=>{starts++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(chunk,encoding,done){const job=JSON.parse(chunk.toString());generated.push(job);const respond=()=>child.stdout.write(JSON.stringify({id:job.id,audio:wav.toString('base64')})+'\n');hold?held.push(respond):setImmediate(respond);done();}});child.kill=()=>{child.emit('exit',0);child.stdout.end();};setImmediate(()=>child.stdout.write('{"ready":true}\n'));return child;};
 return {spawnWorker,generated,held,get starts(){return starts;}};
}
const waitFor=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('Test condition timed out');};
(async()=>{
 fs.mkdirSync(path.join(dir,'tools/bin/voice-env',process.platform==='win32'?'Scripts':'bin'),{recursive:true});fs.writeFileSync(path.join(dir,'tools/bin/voice-env',process.platform==='win32'?'Scripts/python.exe':'bin/python'),'test');fs.mkdirSync(path.join(dir,'tools/bin/kokoro-int8-multi-lang-v1_1'),{recursive:true});fs.writeFileSync(path.join(dir,'tools/bin/kokoro-int8-multi-lang-v1_1/model.int8.onnx'),'test');
 const fake=engine({hold:true}),service=Voice(dir,fake);const warming=service.warmup();assert.strictEqual(service.warmup(),warming,'Startup warmup is idempotent');await waitFor(()=>fake.held.length===1);
 const interactive=service.synthesize({voice:'he',text:'现在马上播报'});fake.held.shift()();await waitFor(()=>fake.generated.length===2);assert.equal(fake.generated[1].text,'现在马上播报','Real request precedes remaining background prompts');fake.held.shift()();await interactive;
 while(service.options().warmup.state==='warming'){if(fake.held.length)fake.held.shift()();await new Promise(r=>setTimeout(r,2));}
 assert.equal((await warming).state,'ready');assert.equal(service.options().warmup.ready,36);assert.equal(fake.starts,1);const commonCalls=fake.generated.length;
 for(const voice of Voice.voices)for(const text of Object.values(Voice.prompts))assert.deepEqual(await service.synthesize({voice:voice.id,text}),wav);
 assert.equal(fake.generated.length,commonCalls,'All six voices serve common phrases without resynthesis');
 const cacheDir=path.join(dir,'tools/bin/navigation-voice-cache/v1-kokoro-int8-zh');assert.equal(fs.readdirSync(cacheDir).length,36,'Only fixed public phrases reach disk');service.close();
 const restarted=engine(),next=Voice(dir,restarted);assert.equal((await next.warmup()).state,'ready');assert.equal(restarted.starts,1,'Restart eagerly loads model even with complete phrase cache');assert.equal(restarted.generated.length,0,'Restart reuses fixed phrase audio');
 const one=next.synthesize({voice:'qing',text:'同一句自定义提示'}),two=next.synthesize({voice:'qing',text:'同一句自定义提示'});await Promise.all([one,two]);assert.equal(restarted.generated.length,1,'Duplicate requests share generation');assert.equal(fs.readdirSync(cacheDir).length,36);next.close();
 fs.writeFileSync(path.join(cacheDir,fs.readdirSync(cacheDir)[0]),'corrupt');const repairFake=engine(),repair=Voice(dir,repairFake);assert.equal((await repair.warmup()).ready,36);assert.equal(repairFake.generated.length,1,'Invalid saved WAV is regenerated');repair.close();
 const busyFake=engine({hold:true}),busy=Voice(dir,busyFake);const requests=Array.from({length:6},(_,i)=>busy.synthesize({voice:'he',text:'等待队列'+i}));const settled=Promise.allSettled(requests);await assert.rejects(busy.synthesize({voice:'he',text:'超出队列'}),e=>e.status===429);await waitFor(()=>busyFake.held.length===1);busy.close();assert((await settled).every(r=>r.status==='rejected'),'Close releases active and queued promises');
 const missing=Voice(path.join(dir,'missing'),engine());assert.equal((await missing.warmup()).state,'unavailable');assert.equal(missing.options().available,false);missing.close();
 console.log('Voice warmup checks passed: model startup, 36 shared phrases, interactive priority, persistent cache, corruption recovery, dedupe, bounded queue, shutdown and missing installation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
