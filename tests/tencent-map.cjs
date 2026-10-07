const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const moduleOf=source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const KEY='TEST1-TEST2-TEST3-TEST4-TEST5-TEST6';
async function adapterChecks(){
 const coordinates=await moduleOf(read('dist/shared/coordinates.js')),routing=await moduleOf(read('dist/shared/routing.js'));
 global.__tencentTest={...coordinates,...routing};
 const source=read('dist/shared/tencent-map.js').replace(/^import .*;\r?\n/gm,''),api=await moduleOf('const {toTencent,fromTencent,roadGraph,walkingRoute,walkingLeg}=globalThis.__tencentTest;\n'+source);
 for(const p of [{lng:116.404,lat:39.915},{lng:106.137,lat:38.501},{lng:106.129,lat:38.494}]){const converted=coordinates.toTencent(p),back=coordinates.fromTencent(converted);assert.ok(Math.abs(converted.lng-p.lng)>.001);assert.ok(Math.abs(back.lng-p.lng)<1e-8&&Math.abs(back.lat-p.lat)<1e-8);}
 const sample=coordinates.toTencent({lng:116.404,lat:39.915});assert.ok(Math.abs(sample.lng-116.41024449916938)<1e-10);assert.ok(Math.abs(sample.lat-39.91640428150164)<1e-10);
 assert.deepEqual(coordinates.toTencent([-122,37]),{lng:-122,lat:37});assert.deepEqual(coordinates.fromTencent([-122,37]),{lng:-122,lat:37});assert.throws(()=>coordinates.toTencent({lng:NaN,lat:38}));assert.throws(()=>coordinates.toTencent([106,91]));
 let scripts=[],removed=0;global.window={};global.document={createElement:()=>({nodes:{},events:{},remove(){removed++;this.removed=true;},setAttribute(k,v){this[k]=v;},addEventListener(k,f){this.events[k]=f;},querySelector(s){return this.nodes[s]??={style:{},setAttribute(k,v){this[k]=v;}};}}),head:{append:s=>scripts.push(s)}};global.matchMedia=()=>({matches:false});
 await assert.rejects(api.loadTencent(''),/尚未配置/);assert.equal(scripts.length,0);
 const failure=api.loadTencent(KEY),same=api.loadTencent(KEY);assert.equal(failure,same);assert.equal(scripts.length,1);assert.equal(new URL(scripts[0].src).origin,'https://map.qq.com');scripts[0].onerror();await assert.rejects(failure,/无法连接/);assert.equal(removed,1);
 let maps=[],layers=[];
 class LatLng{constructor(lat,lng){this.lat=lat;this.lng=lng;}getLat(){return this.lat;}getLng(){return this.lng;}}
 class Bounds{constructor(sw,ne){assert(sw&&ne);this.values=[sw,ne];}extend(p){this.values.push(p);return this;}}
 class MapSDK{constructor(el,options){this.el=el;this.options=options;this.rotation=0;this.pitch=0;this.events={};maps.push(this);setImmediate(()=>this.events.tilesloaded?.());}on(name,fn){this.events[name]=fn;}removeControl(id){this.removedControl=id;}getControl(id){assert.equal(id,'zoom');return {setPosition:p=>this.zoomPosition=p};}getRotation(){return this.rotation;}getPitch(){return this.pitch;}setRotation(r){this.rotateTo(((r%360)+360)%360,{});}setPitch(p){this.pitchTo(p,{});}rotateTo(r,options){this.rotation=r;this.motion=options;this.events.rotate?.();}pitchTo(p,options){this.pitch=p;this.motion=options;this.events.pitch?.();}fitBounds(b,options){this.bounds=b;this.fit=options;}easeTo(view,options){this.view=view;this.motion=options;if('rotation'in view)this.rotateTo(view.rotation,options);if('pitch'in view)this.pitchTo(view.pitch,options);}panTo(p){this.pan=p;}destroy(){this.destroyed=true;}}
 class Style{constructor(options){Object.assign(this,options);}}
 class Layer{constructor(options){Object.assign(this,options);this.events={};layers.push(this);}on(name,fn){this.events[name]=fn;}setGeometries(g){this.geometries=g;}destroy(){this.destroyed=true;}}
 const T={Map:MapSDK,LatLng,LatLngBounds:Bounds,MultiPolygon:Layer,PolygonStyle:Style,MultiMarker:Layer,MarkerStyle:Style,MultiCircle:Layer,CircleStyle:Style,MultiPolyline:Layer,PolylineStyle:Style,constants:{DEFAULT_CONTROL_ID:{ROTATION:'rotation',ZOOM:'zoom'},CONTROL_POSITION:{BOTTOM_RIGHT:'bottom-right'}}};
 const success=api.loadTencent(KEY);window.TMap=T;const callback=new URL(scripts.at(-1).src).searchParams.get('callback');window[callback]();assert.equal(await success,T);assert.equal(window[callback],undefined);assert.equal(await api.loadTencent(KEY),T);assert.equal(scripts.length,2);await assert.rejects(api.loadTencent('OTHER-KEY'),/刷新/);
 const a={id:'a',name:'起点',lng:106,lat:38},b={id:'b',name:'终点',lng:106.001,lat:38.001};
 const catalog={map:{provider:'tencent',tencentKey:KEY},campus:{center:[106,38],boundary:[[105.999,37.999],[106.002,37.999],[106.002,38.002],[105.999,38.002]]},points:[a,b]};
 const geo={metadata:{fetchedAt:'2026-10-07'},features:[{properties:{kind:'footway'},geometry:{type:'LineString',coordinates:[[106,38],[106.001,38],[106.001,38.001]]}}]};
 const original=JSON.stringify(catalog),element={isConnected:true,classList:{add(){},remove(){}},replaceChildren(){},append(n){if(n.className==='map-orientation')this.orientation=n;else this.notice=n;}};let selected,picked,pickAllowed=true;
 const map=await api.tencentMap(element,catalog,geo,{onPoint:id=>selected=id,onPick:p=>picked=p,canPick:()=>pickAllowed,routeStops:[a,b],trail:[a,b],inside:p=>p.lng<107});
 assert.equal(map.provider,'tencent');assert.equal(element.notice.removed,true,'Loaded map must remove the persistent top-left label');assert.equal(map.reference.missing,0);assert.ok(map.reference.length>100);assert.equal(JSON.stringify(catalog),original);
 const sdk=maps.at(-1),layer=id=>layers.find(l=>l.id===id),pins=layer('campus-points');
 assert.equal(sdk.options.scrollable,true);assert.equal(sdk.options.viewMode,'3D');assert.equal(sdk.options.rotatable,true);assert.equal(sdk.options.pitchable,true);assert.equal(sdk.options.pitch,0);assert.equal(sdk.options.touchZoomable,true);
 assert.equal(sdk.el.className,'tencent-map-surface','Own buttons must remain outside the SDK event container');
 assert.equal(sdk.removedControl,'rotation');assert.equal(sdk.zoomPosition,'bottom-right');
 const compass=element.orientation,clickView=view=>{let stopped=false;compass.events.click({stopPropagation(){stopped=true;},target:{closest:()=>({dataset:{view}})}});assert.equal(stopped,true,'Control clicks must not select an origin or destination');};
 clickView('right');assert.equal(sdk.rotation,45);assert.equal(compass.nodes['.map-compass-arrow'].style.transform,'rotate(-45deg)');clickView('left');assert.equal(sdk.rotation,0);clickView('left');assert.equal(sdk.rotation,315);assert.equal(compass.nodes['.map-compass-arrow'].style.transform,'rotate(45deg)');
 clickView('pitch');assert.equal(sdk.pitch,45);assert.equal(compass.nodes['[data-view="pitch"]']['aria-pressed'],'true');clickView('pitch');assert.equal(sdk.pitch,0);clickView('pitch');clickView('north');assert.equal(sdk.rotation,0);assert.equal(sdk.pitch,0);assert.equal(compass.nodes['[data-view="pitch"]']['aria-pressed'],'false');
 clickView('north');sdk.view=undefined;
 assert.equal(pins.geometries[0].styleId,'stop1');assert.ok(Math.abs(pins.geometries[0].position.lng-a.lng)>.001);
 map.select('b',{pan:false});assert.equal(pins.geometries[1].styleId,'selected');assert.equal(sdk.view,undefined);map.focus('a');assert.equal(sdk.view.zoom,18);assert.equal(pins.geometries[0].rank,1000);map.select(null);assert.equal(pins.geometries[0].styleId,'stop1');
 pins.events.click({geometry:{id:'b'}});assert.equal(selected,'b');const clicked=coordinates.toTencent({lng:106.0007,lat:38.0004});sdk.events.click({latLng:new LatLng(clicked.lat,clicked.lng)});assert.ok(Math.abs(picked.lng-106.0007)<1e-8);assert.ok(Math.abs(picked.lat-38.0004)<1e-8);pickAllowed=false;picked=null;sdk.events.click({latLng:new LatLng(clicked.lat,clicked.lng)});assert.equal(picked,null);
 map.pick(a);assert.ok(layer('campus-positions').geometries.some(g=>g.id==='pick'));map.pick(null);assert.ok(!layer('campus-positions').geometries.some(g=>g.id==='pick'));
 const leg=map.plan(a,b);assert.equal(leg.available,true);assert.equal(leg.path[0][0],a.lng);assert.ok(layer('walking-guide').geometries[0].paths[0].getLng()!==a.lng);assert.ok(layer('campus-positions').geometries.some(g=>g.id==='end'));const fitted=sdk.bounds;map.plan(a,b,{fit:false});assert.equal(sdk.bounds,fitted);
 assert.equal(map.navigation(a,b).available,true);assert.equal(layer('walking-guide').geometries[0].styleId,'green');map.navigation(null);assert.deepEqual(layer('walking-guide').geometries,[]);
 map.trail([]);assert.deepEqual(layer('recorded-trail').geometries,[]);map.trail([a,b]);assert.equal(layer('recorded-trail').geometries[0].paths.length,2);
 map.locate({...a,accuracy:10},{follow:false});assert.equal(sdk.pan,undefined);assert.equal(layer('position-accuracy').geometries[0].radius,10);map.locate({...b,accuracy:20});assert.ok(sdk.pan);const pan=sdk.pan;map.locate({lng:108,lat:38,accuracy:30});assert.equal(sdk.pan,pan);
 sdk.events.context_lost();assert.match(element.notice.textContent,/显示中断/);
 map.overview();sdk.events.resize();map.destroy();map.destroy();assert(sdk.destroyed&&layers.every(l=>l.destroyed));assert(compass.removed);const rotationAfterDestroy=sdk.rotation;clickView('right');assert.equal(sdk.rotation,rotationAfterDestroy);assert.equal(map.navigation(a,b),null);assert.equal(map.plan(a,b).available,false);
 const hidden={isConnected:false};const abandoned=await api.tencentMap(hidden,catalog,geo);abandoned.destroy();assert.equal(maps.length,1);
 const pickedOnly=await api.tencentMap(element,catalog,geo,{onPick:()=>false});const pickSDK=maps.at(-1);pickSDK.events.click({latLng:new LatLng(clicked.lat,clicked.lng)});assert.deepEqual(layers.filter(l=>l.id==='campus-positions').at(-1).geometries,[]);pickedOnly.destroy();
 const realTimeout=global.setTimeout,oldMap=T.Map;
 T.Map=class extends MapSDK{on(name,fn){if(name!=='tilesloaded')super.on(name,fn);}};
 global.setTimeout=(fn,delay,...args)=>delay===15000?setImmediate(fn,...args):realTimeout(fn,delay,...args);
 try{await assert.rejects(api.tencentMap(element,catalog,geo),/底图加载超时/);assert.ok(maps.at(-1).destroyed);assert.ok(layers.every(l=>l.destroyed));}finally{global.setTimeout=realTimeout;T.Map=oldMap;}
 console.log('Tencent adapter checks passed: coordinate fixtures / inverse / immutability, SDK failure retry / deduplication / key changes, selections, point picking, route and trail display, GPS and cleanup. SDK is simulated; an owner Key is required for live integration.');
}
async function serverChecks(){
 const directory=path.join(__dirname,'.runs','tencent-'+Date.now()),password='TestCampus2026!';
 const child=spawn(process.execPath,['server.cjs'],{cwd:root,windowsHide:true,env:{...process.env,PORT:'4184',ADMIN_PORT:'4186',EXPLORE_DATA_DIR:directory,ADMIN_PASSWORD:password},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);
 const request=async(port,url,method='GET',body,cookie='',expected=200)=>{const response=await fetch('http://127.0.0.1:'+port+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return {data,cookie:response.headers.getSetCookie()[0]?.split(';')[0]||cookie};};
 try{
  let started=false,lastError;for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error(errors);try{await request(4184,'/api/health');started=true;break;}catch(e){lastError=e;}await new Promise(r=>setTimeout(r,100));}assert(started,errors||lastError?.message+" / "+lastError?.cause?.message);
  let cat=(await request(4184,'/api/catalog')).data;assert.equal(cat.map.provider,'tencent');assert.equal(cat.map.configured,false);assert.equal(cat.map.tencentKey,'');
  await request(4186,'/api/admin/settings','PATCH',{mapProvider:'tencent',tencentKey:KEY},'',401);await request(4184,'/api/admin/settings','PATCH',{mapProvider:'tencent',tencentKey:KEY},'',404);
  const {cookie}=await request(4186,'/api/auth/login','POST',{username:'admin',password});const version=cat.version;
  await request(4186,'/api/admin/settings','PATCH',{mapProvider:'tencent',tencentKey:KEY},cookie);cat=(await request(4184,'/api/catalog')).data;assert.equal(cat.map.tencentKey,KEY);assert.equal(cat.map.configured,true);assert.equal(cat.version,version+1);assert.equal(cat.points.length,8);
  const overview=(await request(4186,'/api/admin/overview','GET',undefined,cookie)).data;assert.equal(overview.settings.tencentKey,KEY);assert(!JSON.stringify(overview.audit).includes(KEY));assert(!('amapSecurity'in cat.map));
  for(const key of ['wrong','<script>alert(1)</script>',KEY+'x',123,null])await request(4186,'/api/admin/settings','PATCH',{mapProvider:'tencent',tencentKey:key},cookie,400);
  await request(4186,'/api/admin/settings','PATCH',{mapProvider:'tencent',tencentKey:KEY,secret:'unexpected'},cookie,400);
  assert.equal((await request(4184,'/api/catalog')).data.map.tencentKey,KEY);
  await request(4186,'/api/admin/settings','PATCH',{mapProvider:'tencent',tencentKey:''},cookie);assert.equal((await request(4184,'/api/catalog')).data.map.configured,false);
 }finally{if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});}
 // A migrated installation can be reopened without changing accounts, content or configuration again.
 const file=path.join(directory,'store-v2.json'),before=JSON.parse(fs.readFileSync(file,'utf8')),savedDir=process.env.EXPLORE_DATA_DIR;
 process.env.EXPLORE_DATA_DIR=directory;const open=require('../lib/store.cjs');assert.deepEqual(open(password).db,before);
 const legacy=structuredClone(before);delete legacy.settings.tencentMapMigration;delete legacy.settings.tencentKey;legacy.settings.mapProvider='amap';legacy.settings.amapKey='LEGACY-KEY';legacy.settings.amapSecurity='LEGACY-SECRET';fs.writeFileSync(file,JSON.stringify(legacy));
 const migrated=open(password).db;assert.equal(migrated.settings.mapProvider,'tencent');assert.equal(migrated.settings.amapSecurity,'LEGACY-SECRET');assert.equal(migrated.version,legacy.version+1);for(const k of Object.keys(legacy).filter(k=>!['settings','version'].includes(k)))assert.deepEqual(migrated[k],legacy[k],k);assert.deepEqual(open(password).db,migrated);
 if(savedDir===undefined)delete process.env.EXPLORE_DATA_DIR;else process.env.EXPLORE_DATA_DIR=savedDir;
 console.log('Tencent API / migration checks passed: admin permissions, key validation, clearing, catalog updates, redacted audit, unchanged user data and one-time migration.');
}
(async()=>{await serverChecks();await adapterChecks();})().catch(e=>{console.error(e);process.exitCode=1;});
