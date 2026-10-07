// 发布检查同时核对面向使用者的说明，避免只更新 package.json 和 Release。
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function checkReleaseDocs({current,entries,read=file=>fs.readFileSync(path.join(root,file),'utf8')}){
 const display=current.endsWith('.0')?current.slice(0,-2):current;
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const history=read('版本考古与回退.md'),readme=read('README.md');
 if(!history.includes('当前 **v'+current+'**'))throw Error('回退文档的当前版本未同步：应为 v'+current);
 for(const e of entries){
   const row='| '+e.date+' | `v'+e.version+'` | `'+e.commit.slice(0,7)+'` |';
   if(!history.includes(row))throw Error('回退文档缺少版本或源码对应错误：v'+e.version);
 }
 if(!new RegExp('^# .+ v'+escape(display)+'\\r?$', 'm').test(readme)||!readme.includes('源码标签 `v'+current+'`'))throw Error('README 当前版本未同步');
 if(!read('dist/user/index.html').includes('校园探索试点 v'+display+'</span>'))throw Error('用户端版本显示未同步');
 if(!read('验收记录.md').includes('## v'+display+' 当前发布验收'))throw Error('验收记录缺少当前发布版本');
 // A correct title cannot compensate for stale candidate notices in the body.
 const readmeCurrent=readme.split(/\r?\n## [^\n]*历史实现/)[0];
 const acceptanceCurrent=read('验收记录.md').split(/\r?\n## /).slice(0,2).join('\n## ');
 for(const [name,body] of [['README',readmeCurrent],['验收记录',acceptanceCurrent]]){
  if(/此分支等待|（联调候选）|尚未正式发布|未创建正式标签或 Release/.test(body))throw Error(name+' 正文仍包含候选发布状态');
  const versions=[...body.matchAll(/(?:Latest|当前发布版本|当前正式版本)[^。\n]{0,30}?v(\d+\.\d+(?:\.\d+)?)/g)];
  for(const match of versions){const version=match[1].split('.').length===2?match[1]+'.0':match[1];if(version!==current)throw Error(name+' 正文的当前版本 / Latest 未同步：v'+match[1]);}
 }
}
module.exports={checkReleaseDocs};
