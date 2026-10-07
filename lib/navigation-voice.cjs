const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline');
const {spawn}=require('node:child_process');
// Display names are our fictional guides, not celebrity imitations or app voice packs.
const voices=Object.freeze([
 {id:'he',name:'暖禾',gender:'女声',sid:3,source:'zf_001'},
 {id:'qing',name:'清晴',gender:'女声',sid:14,source:'zf_021'},
 {id:'lu',name:'小鹿',gender:'女声',sid:37,source:'zf_070'},
 {id:'zhou',name:'舟行',gender:'男声',sid:58,source:'zm_009'},
 {id:'chuan',name:'山川',gender:'男声',sid:63,source:'zm_014'},
 {id:'yu',name:'晨宇',gender:'男声',sid:76,source:'zm_045'}]);
function validate(input){const v=voices.find(v=>v.id===input?.voice);if(!v||typeof input.text!=='string'||!input.text.trim()||input.text.length>120||/[\x00-\x1f]/.test(input.text))throw Object.assign(Error('请选择有效音色，语音文字限 120 字'),{status:400});return {voice:v,text:input.text.trim()};}
// Shared exact phrases let every voice reuse the same audio at the important moments.
const prompts=Object.freeze({start:'导航已开始，请沿路线出发。',left:'前方左转，请注意脚下。',right:'前方右转，请注意脚下。',arrival:'你已到达目的地附近，请确认现场入口。',straight:'请沿当前道路继续前进。',enabled:'语音提示已开启，我们一起出发。'});
module.exports=function(root=path.resolve(__dirname,'..'),{spawnWorker=spawn}={}){
 const python=path.join(root,'tools/bin/voice-env',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 const model=path.join(root,'tools/bin/kokoro-int8-multi-lang-v1_1/model.int8.onnx');
 const cacheDir=path.join(root,'tools/bin/navigation-voice-cache/v1-kokoro-int8-zh');
 let worker=null,ready=null,active=0,totalBytes=0,sequence=0,closed=false,pumping=false,warming=null;
 const jobs=new Map(),cache=new Map(),pending=new Map(),queue=[];
 const keyFor=(voice,text)=>crypto.createHash('sha256').update(voice+':'+text).digest('hex');
 const common=new Map(voices.flatMap(v=>Object.values(prompts).map(text=>[keyFor(v.id,text),{voice:v.id,text}])));
 const warm={state:'idle',ready:0,total:common.size};
 const validWav=wav=>wav.length>=44&&wav.length<=2*1024*1024&&wav.toString('ascii',0,4)==='RIFF'&&wav.toString('ascii',8,12)==='WAVE';
 function remember(key,wav){if(cache.has(key))totalBytes-=cache.get(key).length;cache.delete(key);cache.set(key,wav);totalBytes+=wav.length;while(cache.size>80||totalBytes>20*1024*1024){const first=[...cache.keys()].find(k=>!common.has(k))||cache.keys().next().value;totalBytes-=cache.get(first).length;cache.delete(first);}warm.ready=[...common.keys()].filter(k=>cache.has(k)).length;}
 const installed=()=>fs.existsSync(python)&&fs.existsSync(model);
 const options=()=>({available:installed(),provider:'Kokoro · 本机离线合成',voices:voices.map(({sid,...v})=>v),warmup:{...warm},note:installed()?(warm.state==='ready'?'常用导航提示已准备好，路线提示会提前准备。':warm.state==='warming'?'正在后台预热音色与常用提示，地图可正常使用。':'语音在服务器本机生成，无云端语音额度；新句子可能稍慢。'):'本机语音尚未安装，请运行「安装免费导航语音.cmd」。'});
 function ensure(){if(closed)return Promise.reject(Error('语音服务已关闭'));if(ready)return ready;if(!installed())return Promise.reject(Object.assign(Error('本机音色尚未安装，请联系管理员运行安装脚本'),{status:503}));
  ready=new Promise((resolve,reject)=>{
   const child=spawnWorker(python,['-u',path.join(root,'tools/voice-worker.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});worker=child;
   const timer=setTimeout(()=>{reject(Error('音色加载超时'));child.kill();},45000);
   const failure=()=>{clearTimeout(timer);reject(Error('本机语音引擎未就绪，请检查安装'));if(worker!==child)return;worker=null;ready=null;for(const job of jobs.values())job.reject(Error('本机语音引擎中断，请重试'));jobs.clear();};
   child.on('error',failure);child.on('exit',failure);child.stdin.on('error',failure);child.stderr.on('data',()=>{});
   readline.createInterface({input:child.stdout}).on('line',line=>{try{const msg=JSON.parse(line);if(msg.ready){clearTimeout(timer);resolve(child);return;}const job=jobs.get(msg.id);if(!job)return;jobs.delete(msg.id);if(msg.error)job.reject(Error('语音生成失败，请重试'));else{const wav=Buffer.from(msg.audio,'base64');if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF')job.reject(Error('语音内容无效'));else job.resolve(wav);}}catch{}});
  });return ready;
 }
 async function pump(){if(pumping||closed)return;pumping=true;
  try{while(queue.length&&!closed){const task=queue.shift();try{const child=await ensure();if(closed)throw Error('语音服务已关闭');const id=++sequence;const wav=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{jobs.delete(id);reject(Error('语音生成超时，请重试'));child.kill();},45000);jobs.set(id,{resolve:b=>{clearTimeout(timer);resolve(b);},reject:e=>{clearTimeout(timer);reject(e);}});child.stdin.write(JSON.stringify({id,sid:task.voice.sid,text:task.text})+'\n');});if(!validWav(wav))throw Error('语音内容无效');remember(task.key,wav);
   // Persist only the 36 fixed public phrases; custom instructions stay in bounded memory.
   if(common.has(task.key)){try{await fs.promises.mkdir(cacheDir,{recursive:true});await fs.promises.writeFile(path.join(cacheDir,task.key+'.wav'),wav);}catch{}}
   task.resolve(wav);
  }catch(e){task.reject(e);}}}finally{pumping=false;}
 }
 async function synthesize(input,{background=false}={}){const {voice,text}=validate(input),key=keyFor(voice.id,text);
  if(closed)throw Error('语音服务已关闭');if(cache.has(key))return cache.get(key);
  if(pending.has(key)){if(!background){const i=queue.findIndex(t=>t.key===key);if(i>=0){const task=queue.splice(i,1)[0];task.background=false;const first=queue.findIndex(t=>t.background);queue.splice(first<0?queue.length:first,0,task);}}return pending.get(key);}
  if(active>=6)throw Object.assign(Error('语音正在生成，请稍后试听'),{status:429});active++;
  let resolve,reject;const request=new Promise((ok,no)=>{resolve=ok;reject=no;});const task={voice,text,key,resolve,reject,background};const first=queue.findIndex(t=>t.background);queue.splice(background||first<0?queue.length:first,0,task);pending.set(key,request);pump();
  try{return await request;}finally{active--;pending.delete(key);}
 }
 function warmup(){if(warming)return warming;if(closed||!installed()){warm.state='unavailable';return Promise.resolve({...warm});}warm.state='warming';
  warming=(async()=>{try{for(const key of common.keys()){if(closed)break;try{const wav=await fs.promises.readFile(path.join(cacheDir,key+'.wav'));if(validWav(wav))remember(key,wav);}catch{}}
   if(closed)return {...warm};await ensure();
   // One background request at a time so real navigation/preview requests take priority.
   for(const [key,input] of common){if(closed)break;if(!cache.has(key)){while(active>=6&&!closed)await Promise.race([...pending.values()].map(p=>p.catch(()=>{})));if(closed)break;await synthesize(input,{background:true});}}
   if(!closed)warm.state=warm.ready===warm.total?'ready':'degraded';
  }catch{if(!closed)warm.state='degraded';}return {...warm};})();return warming;
 }
 const close=()=>{closed=true;for(const t of queue.splice(0))t.reject(Error('语音服务已关闭'));for(const j of jobs.values())j.reject(Error('语音服务已关闭'));jobs.clear();worker?.kill();worker=null;ready=null;cache.clear();totalBytes=0;warm.state='closed';};
 return {options,synthesize,warmup,close};
};
module.exports.validate=validate;module.exports.voices=voices;module.exports.prompts=prompts;
