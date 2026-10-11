// Compatibility entry only. HTTP, permissions and storage execute in Java.
const {launch,stop}=require('./tools/backend-process.cjs');
const child=launch(__dirname,{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop(child));
child.once('error',e=>{console.error('Java 后端启动失败：'+e.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??0;});
