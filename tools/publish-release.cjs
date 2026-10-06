// Publishes the current package version to this project's existing private repo.
// Uses the existing Git credential helper in memory; never logs/saves credentials.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),repo='Carey0216/explore-shoot',remote='https://github.com/'+repo+'.git';
function git(args){const r=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'-c','http.sslBackend=openssl',...args],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});if(r.status!==0)throw Error('Git 操作失败：'+args[0]);return r.stdout.trim();}
async function main(){
 if(git(['remote','get-url','origin'])!==remote)throw Error('仅可发布到本项目既有仓库');
 const version=require('../package.json').version,tag='v'+version;
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('版本号无效');
 const credential=spawnSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\npath='+repo+'.git\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
 const token=process.env.GITHUB_TOKEN||credential.stdout?.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);
 if(!token)throw Error('未找到现有 GitHub 登录凭据，请先完成 Git 登录');
 async function request(endpoint,body){const r=await fetch('https://api.github.com/repos/'+repo+endpoint,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'explore-shoot-release','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(r.status===404&&!body)return null;if(!r.ok)throw Error('GitHub API 返回 '+r.status);return r.json();}
 const info=await request('');if(!info?.private)throw Error('仓库必须为 private，已停止发布');
 if(git(['status','--porcelain']))throw Error('工作区仍有未提交的更改');
 const commit=git(['rev-parse','HEAD']);if(git(['ls-remote','origin','refs/heads/main']).split(/\s/)[0]!==commit)throw Error('当前版本尚未同步到远端 main');
 if(git(['rev-list','-n','1',tag])!==commit)throw Error('版本标签与当前提交不一致');
 const existing=await request('/releases/tags/'+tag);if(existing){console.log('版本已发布：'+existing.html_url);return;}
 const changes=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8'),part=changes.split('## '+version+' · ')[1];if(!part)throw Error('缺少当前版本的中文更新日志');
 const body='## 探索与拍摄 '+tag+'\n\n'+part.slice(part.indexOf('\n')+1).split('\n## ')[0].trim();
 const release=await request('/releases',{tag_name:tag,target_commitish:commit,name:'v'+version+' · 校园步行导航与玻璃交互',body,draft:false,prerelease:false,make_latest:'true'});
 console.log('已发布 private 仓库版本：'+release.html_url);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
