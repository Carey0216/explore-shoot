const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
module.exports=function(root,{spawnWorker=spawn}={}){
 const python=path.join(root,'tools/bin/translation/env',process.platform==='win32'?'Scripts/python.exe':'bin/python'),children=new Set();
 const installed=()=>fs.existsSync(python)&&['zh_en-1_9','en_zh-1_9','en_ja-1_1','ja_en-1_1'].every(model=>fs.existsSync(path.join(root,'tools/bin/translation',model)));
 function translate(text,target,{signal}={}){
  const batch=Array.isArray(text),items=batch?text:[text];
  if(!items.length||items.length>40||items.some(t=>typeof t!=='string'||!t.trim()||t.length>4000)||items.reduce((sum,t)=>sum+t.length,0)>8000||!['zh-CN','zh-TW','ja','en'].includes(target))return Promise.reject(Object.assign(Error('翻译内容或目标语言无效'),{status:400}));
  if(!installed())return Promise.reject(Object.assign(Error('本机翻译尚未安装，请联系管理员'),{status:503}));
  if(children.size>=2)return Promise.reject(Object.assign(Error('翻译正在进行，请稍后再试'),{status:429}));
  return new Promise((resolve,reject)=>{
   let output='',settled=false;const child=spawnWorker(python,['-u',path.join(root,'tools/translation-worker.py'),'--once'],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});children.add(child);
   const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);children.delete(child);child.kill();output='';error?reject(error):resolve(value);};
   const abort=()=>done(Object.assign(Error('翻译已取消'),{name:'AbortError'})),timer=setTimeout(()=>done(Object.assign(Error('翻译超时，请重试'),{status:504})),60000);
   child.stdout.on('data',chunk=>{output+=chunk;if(output.length>100000)done(Error('翻译输出过大'));});child.stderr.on('data',()=>{});child.on('error',()=>done(Error('本机翻译引擎未就绪')));child.stdin.on('error',()=>done(Error('本机翻译引擎未就绪')));
   child.on('close',()=>{if(settled)return;try{const result=JSON.parse(output);if(result.error|| (batch? !Array.isArray(result.texts)||result.texts.length!==items.length||result.texts.some(t=>typeof t!=='string'):typeof result.text!=='string'))throw Error();done(null,{...(batch?{texts:result.texts}:{text:result.text,source:result.source}),target,provider:'本机离线翻译'});}catch{done(Error('翻译生成失败，请重试'));}});
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();child.stdin.end(JSON.stringify({[batch?'texts':'text']:text,target}));text='';
  });
 }
 const close=()=>{for(const child of children)child.kill();children.clear();};
 return {translate,installed,close};
};
