const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 // Exercise the browser controller with controlled sensor callbacks; no fabricated
 // positions are written to the app, user data or any external map service.
 const guidanceSource=fs.readFileSync(path.join(__dirname,'../dist/shared/guidance.js'),'utf8').replace(/^import .*;\r?\n/gm,'');
 const routing=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../dist/shared/routing.js')).toString('base64'));
 const elements=new Map(['nav-name','nav-label','external-navigation','nav-locate','nav-reading','nav-arrow','walking-distance','route-overview','nav-focus'].map(id=>[id,{style:{},classList:{toggle(){}},textContent:''}]));
 global.document={querySelector:s=>elements.get(s.slice(1)),querySelectorAll:()=>[]};
 let callback,errorCallback,clearCount=0,requestCount=0;
 Object.defineProperty(global,'navigator',{configurable:true,value:{geolocation:{watchPosition(cb,err){callback=cb;errorCallback=err;requestCount++;return requestCount;},clearWatch(){clearCount++;}}}});
 global.__routingForTest=routing;const guide=await import('data:text/javascript;base64,'+Buffer.from('const {distance,direction,meters}=globalThis.__routingForTest;\n'+guidanceSource).toString('base64'));
 global.__navigationTest={...routing,...guide,locationFor:()=>navigator.geolocation,mapApps:()=>{},inCampus:p=>p.lng===106,$:s=>document.querySelector(s),esc:String,icon:()=>'',toast:()=>{}};
 const source=fs.readFileSync(path.join(__dirname,'../dist/shared/navigation.js'),'utf8').replace(/^import .*;\r?\n/gm,'');
 const nav=await import('data:text/javascript;base64,'+Buffer.from('const {$,esc,icon,toast,inCampus,distance,direction,meters,navigationURL,guidance,mapApps,locationFor}=globalThis.__navigationTest;\n'+source).toString('base64'));
 const point={id:'p1',name:'测试点位',lng:106,lat:38.001},catalog={map:{tencentKey:'TEST'},points:[point],campus:{}};
 let legCalls=0;
 const map={reference:{length:200,missing:0},locate(){},navigation(p){if(p)legCalls++;return p?{available:true,path:[[106,38],[106,38.001]],lengthWithApproach:110}:null;},overview(){},focus(){}};
 const session={id:'s1',status:'active',tasks:[{pointId:'p1',status:'pending'}]};
 nav.bindNavigation(session,catalog,map);assert.equal(requestCount,0,'Binding the UI must not request location');
 elements.get('nav-locate').onclick();assert.equal(requestCount,1);assert.match(elements.get('nav-reading').textContent,/正在获取位置/);
 callback({coords:{longitude:106,latitude:38,accuracy:10},timestamp:1});await new Promise(r=>setImmediate(r));assert.equal(legCalls,1);assert.match(elements.get('nav-reading').textContent,/绿色路线/);assert.equal(typeof elements.get('external-navigation').onclick,'function','External maps open only on an explicit click');
 callback({coords:{longitude:106,latitude:38,accuracy:150},timestamp:2});assert.equal(legCalls,1,'Poor precision must not produce confident directions');assert.match(elements.get('nav-reading').textContent,/精度/);
 callback({coords:{longitude:107,latitude:38,accuracy:10},timestamp:3});assert.equal(legCalls,1);assert.match(elements.get('nav-reading').textContent,/校园外/);
 const stale=callback;nav.stopNavigation();assert.equal(clearCount,1);stale({coords:{longitude:106,latitude:38,accuracy:10},timestamp:4});assert.equal(legCalls,1,'Late sensor callbacks must not update after stopping');
 nav.bindNavigation(session,catalog,map);elements.get('nav-locate').onclick();errorCallback({code:1});assert.equal(clearCount,2);assert.match(elements.get('nav-reading').textContent,/权限未开启/);
 elements.get('nav-locate').onclick();nav.bindNavigation({...session,tasks:[{pointId:'p1',status:'done'}]},catalog,map);assert.equal(clearCount,3,'Finishing the last stop must release navigation location');assert.equal(elements.get('external-navigation').hidden,true);
 delete global.__navigationTest;
 console.log('Navigation checks passed: explicit permission request, GPS accuracy/outside-campus handling, stale callbacks, denial and last-stop cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
