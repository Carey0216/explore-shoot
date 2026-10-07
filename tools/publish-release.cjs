// Publish to the existing private repository. Credentials stay in memory.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {checkReleaseDocs}=require('./check-release-docs.cjs');
const root=path.resolve(__dirname,'..'),repo='Carey0216/explore-shoot';
const remote='https://github.com/'+repo+'.git';
const env={...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'};
function git(args){
 const r=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'-c','http.sslBackend=openssl',...args],{cwd:root,encoding:'utf8',windowsHide:true,env});
 if(r.status!==0)throw Error('Git 操作失败：'+args[0]);return r.stdout.trim();
}
function notes(changes,entry){
 const section=changes.split('## '+entry.version+' · '+entry.date)[1];
 if(!section)throw Error('缺少版本 '+entry.version+' 的中文日志或日期不一致');
 const description=section.split(/\r?\n## /)[0].trim();
 if(!description)throw Error('版本日志为空');
 return '## 探索与拍摄 v'+entry.version+'\n\n'+
  (entry.backfilledAt?'开发 / 验收日期：'+entry.date+'。此历史版本于 '+entry.backfilledAt+' 补发 Release，未改写原有 main 历史。\n\n':'')+
  (entry.recovered?'此版为从首次备份恢复的原型源码快照，恢复提交日期不是原始开发日期。源码来源和运行方式见归档 README.md。\n\n':'')+
  '对应源码提交：`'+entry.commit+'`。\n\n'+description;
}
function records(){
 const entries=JSON.parse(fs.readFileSync(path.join(root,'reference/releases.json'),'utf8'));
 const current=require('../package.json').version,changes=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
 const seen=new Set();
 for(const e of entries){
  if(!/^\d+\.\d+\.\d+$/.test(e.version)||seen.has(e.version)||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||e.backfilledAt&&!/^\d{4}-\d{2}-\d{2}$/.test(e.backfilledAt)||!e.title||!/^[a-f0-9]{40}$/.test(e.commit))throw Error('版本对应表格式错误或重复');
  seen.add(e.version);git(['cat-file','-e',e.commit+'^{commit}']);
  const oldPackage=JSON.parse(git(['show',e.commit+':package.json']));
  // 2.0.1 was named in the changelog later; its original package still read 2.0.0.
  if(oldPackage.version!==e.version&&!(e.version==='2.0.1'&&oldPackage.version==='2.0.0'))throw Error('版本与历史 package.json 不匹配：'+e.version);
  e.body=notes(changes,e);
 }
 if(!seen.has(current))throw Error('请先将当前版本与发布提交记录到 reference/releases.json');
 checkReleaseDocs({current,entries});
 return {entries,current};
}
async function main(){
 const arg=process.argv[2];
 if(process.argv.length>3||arg&&!['--history','--check','--list'].includes(arg))throw Error('用法：npm run release -- [--history|--check|--list]');
 if(git(['remote','get-url','origin'])!==remote)throw Error('仅可发布到本项目既有仓库');
 const {entries,current}=records();
 if(arg==='--check'){
  for(const e of entries){if(git(['rev-parse','v'+e.version+'^{commit}'])!==e.commit)throw Error('标签对应错误：'+e.version);}
  console.log('版本、中文日志、源码和标签核对通过：'+entries.map(e=>'v'+e.version).join('、'));return;
 }
 const credential=process.env.GITHUB_TOKEN?null:spawnSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\npath='+repo+'.git\n\n',encoding:'utf8',windowsHide:true,env});
 const token=process.env.GITHUB_TOKEN||credential?.stdout?.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);
 if(!token)throw Error('未找到现有 GitHub 登录凭据，请先完成 Git 登录');
 async function request(endpoint,body){
  const r=await fetch('https://api.github.com/repos/'+repo+endpoint,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'explore-shoot-release','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(r.status===404&&!body)return null;
  if(!r.ok)throw Error('GitHub API 返回 '+r.status);return r.json();
 }
 const info=await request('');if(!info?.private)throw Error('仓库必须为 private，已停止发布');
 if(arg==='--list'){
  const releases=await request('/releases?per_page=100'),latest=await request('/releases/latest');
  console.log('仓库 private；最新版本：'+latest?.tag_name);
  for(const e of entries){const r=releases.find(r=>r.tag_name==='v'+e.version&&!r.draft);if(!r)throw Error('缺少已发布版本：'+e.version);console.log(r.tag_name+' · '+r.name+' · '+r.html_url);}
  if(latest?.tag_name!=='v'+current)throw Error('最新版本标识与当前版本不一致');return;
 }
 if(git(['status','--porcelain']))throw Error('工作区仍有未提交的更改');
 if(git(['ls-remote','origin','refs/heads/main']).split(/\s/)[0]!==git(['rev-parse','HEAD']))throw Error('main 尚未同步到 GitHub');
 const remoteTags=git(['ls-remote','origin','refs/tags/*']);
 for(const e of arg==='--history'?entries:entries.filter(e=>e.version===current)){
  const tag='v'+e.version;
  if(git(['rev-parse',tag+'^{commit}'])!==e.commit)throw Error('本地版本标签与对应表不一致：'+tag);
  const lines=remoteTags.split(/\r?\n/).map(l=>l.split(/\s+/));
  const remoteCommit=lines.find(l=>l[1]==='refs/tags/'+tag+'^{}')?.[0]||lines.find(l=>l[1]==='refs/tags/'+tag)?.[0];
  if(remoteCommit!==e.commit)throw Error('远端版本标签与对应表不一致：'+tag);
  const existing=await request('/releases/tags/'+tag);
  if(existing){if(existing.draft||existing.prerelease)throw Error('已有版本仍处于草稿 / 预发布状态：'+tag);console.log('已存在，保留：'+existing.html_url);continue;}
  const release=await request('/releases',{tag_name:tag,target_commitish:e.commit,name:tag+' · '+e.title,body:e.body,draft:false,prerelease:false,make_latest:e.version===current?'true':'false'});
  console.log('已发布 private 仓库版本：'+release.html_url);
 }
 const latest=await request('/releases/latest');if(latest?.tag_name!=='v'+current)throw Error('最新版本标识异常，请检查 GitHub Release');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={notes};
