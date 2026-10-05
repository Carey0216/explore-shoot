const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const ui='data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../dist/shared/ui.js')).toString('base64');
 const code=fs.readFileSync(path.join(__dirname,'../dist/shared/profile.js'),'utf8').replace("'./ui.js'",JSON.stringify(ui));
 const {saveProfile,avatarHTML}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 assert(avatarHTML({nickname:'<script>'}).includes('&lt;'));assert(!avatarHTML({nickname:'测试'}).includes('<img'));
 assert(avatarHTML({hasAvatar:true,avatarVersion:3}).includes('/api/auth/avatar?v=3'));
 global.location={href:'https://test.trycloudflare.com/#me'};let xhr;
 global.XMLHttpRequest=class {constructor(){this.upload={};xhr=this;}open(method,url){assert.equal(method,'PATCH');assert.equal(url,'https://test.trycloudflare.com/api/auth/profile');}setRequestHeader(){}send(body){assert.equal(JSON.parse(body).nickname,'测试昵称');}abort(){this.onabort();}};
 const progress=[];let promise=saveProfile({nickname:'测试昵称'},{onProgress:p=>progress.push(p)});
 xhr.upload.onprogress({loaded:40,total:100,lengthComputable:true});xhr.upload.onload();xhr.status=200;xhr.responseText='{"account":{"id":"mine","nickname":"测试昵称"}}';xhr.onload();assert.equal((await promise).account.id,'mine');assert.equal(progress[0].loaded/progress[0].total,.4);assert.equal(progress[1].phase,'save');
 promise=saveProfile({nickname:'测试昵称'});xhr.status=503;xhr.responseText='<html>Gateway failure</html>';xhr.onload();await assert.rejects(promise,/服务连接暂时中断/);
 promise=saveProfile({nickname:'测试昵称'});xhr.onerror();await assert.rejects(promise,/上传中断/);
 promise=saveProfile({nickname:'测试昵称'});xhr.ontimeout();await assert.rejects(promise,/保存超时/);
 promise=saveProfile({nickname:'测试昵称'});xhr.status=200;xhr.responseText='{}';xhr.onload();await assert.rejects(promise,/未确认资料保存/);
 const controller=new AbortController();promise=saveProfile({nickname:'测试昵称'},{signal:controller.signal});controller.abort();await assert.rejects(promise,e=>e.name==='AbortError');
 await assert.rejects(saveProfile({nickname:'测试昵称'},{signal:controller.signal}),e=>e.name==='AbortError');
 console.log('Profile client checks passed: private avatar URL, escaped initials, real upload progress, gateway/network/timeout failures and cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
