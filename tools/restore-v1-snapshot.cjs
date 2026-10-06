// Restore only the source files preserved in the first Git backup.
// This creates an isolated commit, never rewrites main or copies runtime data.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),archive='4926936';
const existing=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'rev-parse','--verify','refs/tags/v1.0.0'],{cwd:root,stdio:'ignore',windowsHide:true});
if(existing.status===0){console.error('v1.0.0 已恢复，请使用现有标签；不会重复创建或改写版本。');process.exit(1);}
const run=path.join(root,'tests/.runs');fs.mkdirSync(run,{recursive:true});
const index=path.join(run,'restore-v1-'+process.pid+'.index');
function git(args,input){const r=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),...args],{cwd:root,input,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_INDEX_FILE:index}});if(r.status!==0)throw Error(r.stderr||'Git 操作失败');return r.stdout.trim();}
try{
 git(['read-tree','--empty']);
 const files={
  'server.cjs':'legacy/server-v1.cjs','seed.cjs':'legacy/seed-v1.cjs',
  'tests/integration.cjs':'legacy/integration-v1.cjs','README-v1.md':'legacy/README-v1.md',
  '验收记录-v1.md':'legacy/验收记录-v1.md',
  'dist/index.html':'dist/index.html','dist/app.js':'dist/app.js',
  'dist/style.css':'dist/style.css','dist/assets/campus.jpg':'dist/assets/campus.jpg',
  '.gitignore':'.gitignore'
 };
 for(const [dest,source] of Object.entries(files)){
  const blob=git(['rev-parse',archive+':'+source]);
  git(['update-index','--add','--cacheinfo','100644,'+blob+','+dest]);
 }
 const pkg={name:'explore-shoot',version:'1.0.0',private:true,engines:{node:'>=20'},scripts:{start:'node server.cjs',test:'node tests/integration.cjs'}};
 const readme=`# 探索与拍摄 v1.0.0 · 历史原型恢复归档\n\n原型验收日期：2026-09-28（见验收记录-v1.md）。恢复日期：2026-10-06。\n\n第一版没有独立 Git 提交。本快照从首次备份提交 ${archive} 保存的 legacy 后端、测试、文档和旧 dist 前端逐一恢复；保留原文件内容，仅将后端、初始资料和测试文件恢复到原来的启动路径，并补充 package.json 与本说明。这是恢复提交，不冒充 9 月 28 日的原始提交。没有复制账号、照片、邀请码或运行数据，也未改写 main 历史。\n\n## 运行\n\n在单独目录解压此标签的 Source code，安装 Node.js 20 或更高版本，运行 npm start，然后打开 http://127.0.0.1:4174 。管理端为同一地址下的 /admin。首次运行自动创建本地数据。原有操作说明、演示账号和功能边界见 README-v1.md；其 Windows 启停快捷文件未留存，请使用 npm start 与 Ctrl+C。不要与现有 v3 服务共用端口或数据目录。\n\n## 验证\n\nnpm test 使用独立数据和 4175 端口检查原型接口。原型使用虚构点位与校园配图，没有注册账号、真实地图或实时导航；仅作历史查阅，不是当前部署版本。\n`;
 for(const [dest,content] of [['package.json',JSON.stringify(pkg,null,2)+'\n'],['README.md',readme]]){
  const blob=git(['hash-object','-w','--stdin'],content);git(['update-index','--add','--cacheinfo','100644,'+blob+','+dest]);
 }
 const tree=git(['write-tree']);
 const commit=git(['commit-tree',tree], '恢复 v1.0.0 历史原型源码（来自 4926936 归档，非原始提交）\n');
 console.log(commit);
}finally{if(fs.existsSync(index))fs.unlinkSync(index);}
