const assert=require('node:assert/strict'),fs=require('node:fs');
const mod=s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
(async()=>{
 global.__generatedMessagesTest=await mod(fs.readFileSync('dist/shared/messages-generated.js','utf8'));
 global.__messagesTest=await mod(fs.readFileSync('dist/shared/messages-extra.js','utf8'));
 const {messages,manualMessages}=await mod(fs.readFileSync('dist/shared/messages.js','utf8').replace("import {extraRows} from './messages-extra.js';",'const {extraRows}=globalThis.__messagesTest;').replace("import {generatedMessages} from './messages-generated.js';",'const {generatedMessages}=globalThis.__generatedMessagesTest;'));
 for(const [source,targets] of messages){assert.equal(targets.length,3,source);const keys=s=>(s.match(/\{\w+\}/g)||[]).sort();for(const target of targets){assert(target,source);assert.deepEqual(keys(target),keys(source),source);}}
 global.__i18nTest={messages,manualMessages,getPreferences:()=>({language:'zh-CN'}),subscribePreferences:()=>{}};
 const {translate:t}=await mod('const {messages,manualMessages,getPreferences,subscribePreferences}=globalThis.__i18nTest;\n'+fs.readFileSync('dist/shared/i18n.js','utf8').replace(/^import .*;\r?\n/gm,''));
 assert.equal(t('设置','en'),'Settings');assert.equal(t('设置','ja'),'設定');assert.equal(t('设置','zh-TW'),'設定');assert.equal(t('设置','zh-CN'),'设置');
 assert.equal(t('  设置  ','en'),'  Settings  ');assert.equal(t('个人发布的奇怪点位 X123','en'),'个人发布的奇怪点位 X123');
 assert.equal(t('步行 6 分钟 + 拍摄 6 分钟 + 余量 4 分钟','en'),'Walk 6 min + Photos 6 min + Buffer 4 min');
 for(const lang of ['zh-TW','ja','en']){const status=t('「图书馆xyz」 · 找到 3 个校园点位',lang);assert(status.includes('图书馆xyz'));assert(status.includes('3'));assert.notEqual(status,'「图书馆xyz」 · 找到 3 个校园点位');assert(!t('剩余约 20 米',lang).includes('米')||lang==='zh-TW');}
 const search=await mod('const {$,esc,icon}={};\n'+fs.readFileSync('dist/user/search.js','utf8').replace(/^import .*;\r?\n/gm,''));
 for(const q of ['library','図書館','圖書館'])assert.equal(search.matchingPoints([{name:'北方民族大学图书馆'}],q).length,1);
 console.log(`PASS: ${messages.size} four-language UI messages, placeholder preservation, original community/query content and multilingual search aliases.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
