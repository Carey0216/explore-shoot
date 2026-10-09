const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const source=fs.readFileSync('dist/user/navigation-notice.js','utf8');
 const {navigationNoticeHTML,mountNavigationNotice}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 assert.match(navigationNoticeHTML(),/role="alert"/);assert.match(navigationNoticeHTML(),/aria-atomic="true"/);
 const originalSet=global.setTimeout,originalClear=global.clearTimeout,originalDocument=global.document;
 const timers=new Map(),events=new Map();let id=0;
 global.setTimeout=(fn,duration)=>{timers.set(++id,{fn,duration});return id;};global.clearTimeout=id=>timers.delete(id);
 global.document={hidden:false,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
 try{
  const paragraph={textContent:''},button={},element={hidden:true,querySelector:name=>name==='p'?paragraph:button};
  const notice=mountNavigationNotice(element);
  notice.show('校园外，导航已停止');assert.equal(element.hidden,false);assert.equal(paragraph.textContent,'校园外，导航已停止');assert.equal(timers.size,1);assert.equal([...timers.values()][0].duration,9000);
  notice.show('<img src=x onerror=alert(1)>');assert.equal(paragraph.textContent,'<img src=x onerror=alert(1)>','Reason is plain text');assert.equal(timers.size,1,'A new reason replaces the old expiry');
  document.hidden=true;events.get('visibilitychange')();assert.equal(element.hidden,true);assert.equal(timers.size,0);
  notice.show('后台停止定位');assert.equal(timers.size,0,'No countdown while away');document.hidden=false;events.get('visibilitychange')();assert.equal(element.hidden,false);assert.equal(paragraph.textContent,'后台停止定位');assert.equal(timers.size,1);
  button.onclick();assert.equal(element.hidden,true);assert.equal(timers.size,0);events.get('visibilitychange')();assert.equal(element.hidden,true,'Dismissed warnings do not return');
  notice.show('定位失败');[...timers.values()][0].fn();assert.equal(element.hidden,true);assert.equal(timers.size,0);
  notice.show('另一条提醒');notice.destroy();assert.equal(events.size,0);assert.equal(timers.size,0);assert.equal(button.onclick,null);notice.show('退出页面后的旧回调');assert.equal(element.hidden,true);
 }finally{global.setTimeout=originalSet;global.clearTimeout=originalClear;if(originalDocument===undefined)delete global.document;else global.document=originalDocument;}
 const css=fs.readFileSync('dist/user/navigation-view.css','utf8');assert.match(css,/\.navigation-notice\{[^}]*position:fixed[^}]*pointer-events:none/);assert.match(css,/\.navigation-notice button\{[^}]*pointer-events:auto/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.navigation-notice\{animation:none/);
 console.log('Navigation notice checks passed: nonmodal top alert, safe text, expiry replacement, background return, dismissal, retry and disposal.');
})().catch(e=>{console.error(e);process.exitCode=1;});
