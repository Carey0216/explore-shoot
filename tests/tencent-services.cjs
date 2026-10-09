const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'../dist/shared',f),'utf8');
const moduleOf=s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
(async()=>{
 const coordinates=await moduleOf(read('coordinates.js')),routing=await moduleOf(read('routing.js'));
 global.__servicesTest={...coordinates,...routing};
 const services=await moduleOf('const {toTencent,fromTencent,distance}=globalThis.__servicesTest;\n'+read('tencent-services.js').replace(/^import .*;\r?\n/gm,''));
 class LatLng{constructor(lat,lng){this.lat=lat;this.lng=lng;}getLat(){return this.lat;}getLng(){return this.lng;}}
 const start={lng:106.092,lat:38.498},target={lng:106.093,lat:38.496};let calls=0,resolve,reply;
 const T={LatLng,service:{Walking:class{search(params){calls++;assert.ok(Math.abs(params.from.lng-start.lng)>.001);return reply||new Promise(r=>resolve=r);}}}};
 const a=coordinates.toTencent(start),b=coordinates.toTencent(target),response={status:0,result:{routes:[{distance:345,duration:5,polyline:[new LatLng(a.lat,a.lng),new LatLng(b.lat,b.lng)],steps:[{instruction:'沿校园道路步行，右转',distance:345,act_desc:'右转'}]}]}};
 const first=services.tencentWalking(T,'TEST',start,target),second=services.tencentWalking(T,'TEST',start,target);await new Promise(r=>setImmediate(r));assert.equal(calls,1);resolve(response);const leg=await first;await second;
 assert.equal(leg.provider,'tencent');assert.equal(leg.length,345);assert.equal(leg.duration,5);assert.deepEqual(leg.connectors,[]);assert.ok(Math.abs(leg.path[0][0]-start.lng)<1e-8);assert.ok(leg.endGap<.01);assert.equal(leg.steps[0].instruction,response.result.routes[0].steps[0].instruction);
 leg.path[0][0]=0;const cached=await services.tencentWalking(T,'TEST',start,target);assert.notEqual(cached.path[0][0],0);assert.equal(calls,1,'Repeated route uses only a memory cache');
 assert.match(services.serviceError({status:199}),/WebService/);assert.match(services.serviceError({status:121}),/每日额度/);assert.match(services.serviceError({status:120}),/频率/);assert.match(services.serviceError({status:110}),/授权/);assert.match(services.serviceError({status:190}),/Key 无效/);assert.match(services.serviceError({status:378}),/可步行路线/);
 reply=Promise.resolve({status:199});assert.equal((await services.tencentWalking(T,'DENIED',start,target)).available,false);assert.equal((await services.tencentWalking(T,'DENIED',start,target)).available,false);assert.equal(calls,3,'Failures do not become cached routes');
 assert.equal((await services.tencentWalking(T,'CANCEL',start,target,{alive:()=>false})).available,false);assert.equal(calls,3);
 assert.equal(services.tencentLeg({status:0,result:{routes:[]}},start,target).available,false);assert.equal(services.tencentLeg({status:0,result:{routes:[{...response.result.routes[0],polyline:[new LatLng(NaN,106),new LatLng(38,106)]}]}},start,target).available,false);
 let scripts=[];Object.defineProperty(global,'navigator',{configurable:true,value:{}});global.window={};global.document={createElement:()=>({remove(){}}),head:{append:s=>scripts.push(s)}};
 const location=await moduleOf('const {fromTencent}=globalThis.__servicesTest;\n'+read('tencent-location.js').replace(/^import .*;\r?\n/gm,''));
 const geo=location.locationFor({map:{tencentKey:'TEST'}});let result,error;geo.getCurrentPosition(p=>result=p,e=>error=e);const cancelled=geo.watchPosition(()=>{throw Error('Cancelled watch called');});geo.clearWatch(cancelled);assert.equal(scripts.length,1,'SDK loading is shared');
 const instances=[];class GeoSDK{constructor(options){assert.equal(options.key,'TEST');instances.push(this);}getLocation(cb,err,options){this.once=cb;this.error=err;assert.equal(options.highAccuracy,true);}watchPosition(cb,err,options){this.watch=cb;this.watchError=err;assert.equal(options.highAccuracy,true);}clearWatch(){this.cleared=true;}}
 window.LBS={WebComponent:{Geolocation:GeoSDK}};scripts[0].onload();await new Promise(r=>setImmediate(r));assert.equal(instances.length,1,'Stop before SDK load never starts a sensor');
 instances[0].once({...a,accuracy:12,type:'h5'});assert.ok(Math.abs(result.coords.longitude-start.lng)<1e-8);assert.equal(result.coords.accuracy,12);instances[0].once({...a,accuracy:5000,type:'ip'});assert.equal(error.code,2,'Never use city IP coordinates as GPS');
 let watchResult;const id=geo.watchPosition(p=>watchResult=p,e=>error=e);await new Promise(r=>setImmediate(r));const active=instances.at(-1);active.once({...a,accuracy:8,type:'h5'});assert.equal(watchResult.coords.accuracy,8);assert.equal(typeof active.watch,'function');geo.clearWatch(id);assert(active.cleared);watchResult=null;active.watch({...b,accuracy:8,type:'h5'});assert.equal(watchResult,null);
 const denied=geo.watchPosition(()=>{},e=>error=e);await new Promise(r=>setImmediate(r));instances.at(-1).error({status:10001,logs:[{status:10101}]});assert.equal(error.code,1);geo.clearWatch(denied);
 location.locationFor({map:{}}).getCurrentPosition(()=>{},e=>error=e);assert.equal(error.code,2);
 const links=await moduleOf('const {toTencent}=globalThis.__servicesTest;\n'+read('tencent-links.js').replace(/^import .*;\r?\n/gm,''));
 const mobile=links.tencentLinks({...target,name:'测试终点 & 西校区'},start,'TEST',{mobile:true});const native=new URL(mobile.native);assert.equal(native.protocol,'qqmap:');assert.equal(native.searchParams.get('type'),'walk');assert.equal(native.searchParams.get('referer'),'TEST');assert.equal(native.searchParams.get('to'),'测试终点 & 西校区');assert.equal(native.searchParams.get('tocoord'),b.lat.toFixed(6)+','+b.lng.toFixed(6));
 const desktop=links.tencentLinks({...target,name:'终点;非法分隔符'},null,'TEST');assert.equal(desktop.native,null);assert.equal(new URL(desktop.web).pathname,'/uri/v1/marker');assert.ok(new URL(desktop.web).searchParams.get('marker').endsWith(';addr:北方民族大学'));const automatic=new URL(links.tencentLinks({...target,name:'终点'},null,'TEST',{mobile:true}).web);assert.equal(automatic.searchParams.has('fromcoord'),false);
 console.log('Tencent service checks passed: SDK coordinate decoding, provider duration/steps, shared requests/cache isolation, service denial, cancellation, malformed routes, H5 permission errors, no IP fallback, stopped/stale sensors and Tencent app/web links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
