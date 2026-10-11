// Compatibility tooling only: all HTTP requests and business rules execute in Java.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
function launch(root,options={}){
 const jar=path.join(root,'backend/target/explore-shoot-backend.jar');
 if(!fs.existsSync(jar))throw Error('请先运行 powershell -NoProfile -File tools/build-backend.ps1 编译 Java 后端。');
 // Windows locks a running JAR. Use a content-addressed copy so builds never overwrite a live file.
 const bytes=fs.readFileSync(jar),hash=crypto.createHash('sha256').update(bytes).digest('hex'),runtime=path.join(root,'tools/bin/backend-runtime');fs.mkdirSync(runtime,{recursive:true});const executable=path.join(runtime,hash+'.jar');
 if(!fs.existsSync(executable))fs.writeFileSync(executable,bytes,{flag:'wx'});
 return spawn(process.env.EXPLORE_JAVA||'java',['-Dfile.encoding=UTF-8','-jar',executable],{...options,cwd:root,windowsHide:true,env:{...process.env,...options.env,EXPLORE_PROJECT_ROOT:root,EXPLORE_PARENT_PID:String(process.pid),EXPLORE_BUILD_HASH:hash}});
}
function stop(child){if(!child||child.exitCode!==null)return;if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();}
module.exports={launch,stop};
