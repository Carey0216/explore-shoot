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
module.exports=function(root=path.resolve(__dirname,'..')){
 const python=path.join(root,'tools/bin/voice-env',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 const model=path.join(root,'tools/bin/kokoro-int8-multi-lang-v1_1/model.int8.onnx');
 let worker=null,ready=null,active=0,totalBytes=0,sequence=0;const jobs=new Map(),cache=new Map(),pending=new Map();
 const installed=()=>fs.existsSync(python)&&fs.existsSync(model);
 const options=()=>({available:installed(),provider:'Kokoro · 本机离线合成',voices:voices.map(({sid,...v})=>v),note:installed()?'语音在服务器本机生成，无云端语音额度；首次试听可能稍慢。':'本机语音尚未安装，请运行「安装免费导航语音.cmd」。'});
 function ensure(){if(ready)return ready;if(!installed())return Promise.reject(Object.assign(Error('本机音色尚未安装，请联系管理员运行安装脚本'),{status:503}));
  ready=new Promise((resolve,reject)=>{
   const child=spawn(python,['-u',path.join(root,'tools/voice-worker.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});worker=child;
   const timer=setTimeout(()=>{reject(Error('音色加载超时'));child.kill();},45000);
   const failure=()=>{clearTimeout(timer);if(worker===child){worker=null;ready=null;}reject(Error('本机语音引擎未就绪，请检查安装'));for(const job of jobs.values())job.reject(Error('本机语音引擎中断，请重试'));jobs.clear();};
   child.on('error',failure);child.on('exit',failure);child.stdin.on('error',failure);child.stderr.on('data',()=>{});
   readline.createInterface({input:child.stdout}).on('line',line=>{try{const msg=JSON.parse(line);if(msg.ready){clearTimeout(timer);resolve(child);return;}const job=jobs.get(msg.id);if(!job)return;jobs.delete(msg.id);if(msg.error)job.reject(Error('语音生成失败，请重试'));else{const wav=Buffer.from(msg.audio,'base64');if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF')job.reject(Error('语音内容无效'));else job.resolve(wav);}}catch{}});
  });return ready;
 }
 async function synthesize(input){const {voice,text}=validate(input),key=crypto.createHash('sha256').update(voice.id+':'+text).digest('hex');
  if(cache.has(key))return cache.get(key);if(pending.has(key))return pending.get(key);if(active>=6)throw Object.assign(Error('语音正在生成，请稍后试听'),{status:429});active++;
  const request=(async()=>{const child=await ensure(),id=++sequence;const wav=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{jobs.delete(id);reject(Error('语音生成超时，请重试'));child.kill();},45000);jobs.set(id,{resolve:b=>{clearTimeout(timer);resolve(b);},reject:e=>{clearTimeout(timer);reject(e);}});child.stdin.write(JSON.stringify({id,sid:voice.sid,text})+'\n');});cache.set(key,wav);totalBytes+=wav.length;while(cache.size>80||totalBytes>20*1024*1024){const first=cache.keys().next().value;totalBytes-=cache.get(first).length;cache.delete(first);}return wav;})();
  pending.set(key,request);try{return await request;}finally{active--;pending.delete(key);}
 }
 const close=()=>{worker?.kill();worker=null;ready=null;cache.clear();totalBytes=0;};
 return {options,synthesize,close};
};
module.exports.validate=validate;module.exports.voices=voices;
