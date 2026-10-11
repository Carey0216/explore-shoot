// Export tracked historical source only. Never switch main or reuse live data.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawnSync,spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function git(args){
 const r=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'-c','core.autocrlf=false',...args],{cwd:root,encoding:'utf8',windowsHide:true});
 if(r.status!==0)throw Error('Git 操作失败；请确认安装 Git 并先运行 git fetch origin --tags。');
 return r.stdout.trim();
}
function entries(){
 return [...require('../reference/releases.json').map(e=>({...e,ref:'v'+e.version})),...require('../reference/history.json')];
}
function exportSource(ref){
 const entry=entries().find(e=>e.ref===ref);
 if(!entry)throw Error('未知历史标签；运行 npm run history -- list 查看可用项。');
 const commit=git(['rev-parse','--verify','refs/tags/'+entry.ref+'^{commit}']);
 if(commit!==entry.commit)throw Error('标签与已记录源码不一致，停止导出。');
 if(process.platform!=='win32')throw Error('此便捷导出工具使用 Windows PowerShell；其他系统请使用文档中的 git archive 命令。');
 const runRoot=path.join(root,'history-runs');fs.mkdirSync(runRoot,{recursive:true});
 const directory=fs.mkdtempSync(path.join(runRoot,ref.replaceAll('/','-')+'-'));
 const zip=directory+'.zip';
 git(['archive','--format=zip','--output='+zip,commit]);
 // Use built-in .NET ZIP support; avoid inherited PSModulePath mixing PS 5/7 modules.
 const extract=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:EXPLORE_HISTORY_ZIP,$env:EXPLORE_HISTORY_OUTPUT)"],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,EXPLORE_HISTORY_ZIP:zip,EXPLORE_HISTORY_OUTPUT:directory}});
 if(extract.status!==0)throw Error('源码解压失败，已保留 ZIP：'+zip+'\n'+(extract.error?.message||extract.stderr||'PowerShell 退出码 '+extract.status));
 fs.unlinkSync(zip);
 return {entry,directory};
}
async function checkPort(port){
 return new Promise((resolve,reject)=>{
  const server=net.createServer();server.once('error',()=>reject(Error('端口 '+port+' 已占用，请先结束另一次旧版体验。')));
  server.listen(port,'127.0.0.1',()=>server.close(resolve));
 });
}
function buildBackend(directory){
 if(!fs.existsSync(path.join(directory,'backend/pom.xml')))return;
 const build=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(directory,'tools/build-backend.ps1'),'-SkipTests'],{cwd:directory,encoding:'utf8',windowsHide:true});
 if(build.status!==0)throw Error('历史 Java 后端编译失败；请确认 JDK 21+ 与网络可用。');
}
async function main(){
 const [action,ref,...extra]=process.argv.slice(2);
 if(extra.length||!['list','export','run'].includes(action)||action==='list'&&ref||action!=='list'&&!ref)throw Error('用法：npm run history -- list | export <标签> | run <标签>');
 if(action==='list'){
  for(const e of entries())console.log(e.ref+' · '+e.date+' · '+e.title+' · '+e.commit.slice(0,7));
  return;
 }
 const entry=entries().find(e=>e.ref===ref);
 if(!entry)throw Error('未知历史标签；运行 npm run history -- list 查看可用项。');
 const isV1=entry.version==='1.0.0';
 if(action==='run'){await checkPort(4274);if(!isV1)await checkPort(4276);}
 const result=exportSource(ref),directory=result.directory;
 console.log('已导出 '+ref+' 源码：'+directory);
 if(action==='export')return;
 buildBackend(directory);
 console.log('用户端：http://127.0.0.1:4274');
 console.log('管理端：'+(isV1?'http://127.0.0.1:4274/admin':'http://localhost:4276'));
 console.log('使用独立空数据；管理员初始密码遵循该版 README 或当前 ADMIN_PASSWORD。输入 quit 后回车或 Ctrl+C 停止，文件与体验数据保留。');
 const child=spawn(process.execPath,[path.join(directory,'server.cjs')],{cwd:directory,stdio:['ignore','inherit','inherit'],windowsHide:true,env:{...process.env,PORT:'4274',ADMIN_PORT:'4276',EXPLORE_DATA_DIR:path.join(directory,'data')}});
 const input=require('node:readline').createInterface({input:process.stdin});
 input.on('line',line=>{if(line.trim().toLowerCase()==='quit')child.kill();});
 input.once('SIGINT',()=>child.kill());
 child.once('error',()=>{input.close();console.error('旧版服务启动失败。');process.exitCode=1;});
 child.once('exit',code=>{input.close();process.exitCode=code??0;});
 process.once('SIGINT',()=>child.kill());
 process.once('SIGTERM',()=>child.kill());
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={entries,exportSource,buildBackend};
