import {toTencent,fromTencent} from './coordinates.js';
import {campusWalking} from './campus-walking.js';
import {routeProgress} from './guidance.js';
let loading=null,loadedKey=null,sequence=0;
// A browser key is public by design. Restrict its allowed domains in Tencent's console.
export function loadTencent(key){
 if(!key)return Promise.reject(Error('腾讯地图尚未配置'));
 if(loadedKey&&loadedKey!==key)return Promise.reject(Error('地图配置已改变，请刷新页面'));
 if(window.TMap&&loadedKey===key)return Promise.resolve(window.TMap);
 if(loading)return loading;
 loadedKey=key;
 loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script'),callback='__exploreTencent'+(++sequence);let settled=false;
  const done=(error)=>{if(settled)return;settled=true;clearTimeout(timer);delete window[callback];script.onerror=null;if(error){script.remove();loadedKey=null;loading=null;reject(error);}else resolve(window.TMap);};
  window[callback]=()=>done(window.TMap?.Map?null:Error('腾讯地图加载失败，请检查 Key 与域名设置'));
  const timer=setTimeout(()=>done(Error('腾讯地图连接超时，请检查网络与 Key')),12000);
  script.src='https://map.qq.com/api/gljs?v=1.exp&libraries=service&key='+encodeURIComponent(key)+'&callback='+callback;
  script.async=true;script.onerror=()=>done(Error('腾讯地图暂时无法连接'));document.head.append(script);
 });
 return loading;
}
const svg=(body)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">'+body+'</svg>');
function pin(color,label='●',selected=false){return svg(`${selected?'<circle cx="20" cy="20" r="20" fill="#428beb" opacity=".2"/>':''}<path d="M20 44C15 36 5 29 5 20a15 15 0 0 1 30 0c0 9-10 16-15 24Z" fill="${color}" stroke="white" stroke-width="3"/><text x="20" y="25" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="white">${label}</text>`);}
const detached=()=>({provider:'tencent',destroy(){},overview(){},select(){},focus(){},pick(){},trail(){},locate(){},navigation(){},plan(){return {available:false,reason:'地图页面已关闭'};}});
export async function tencentMap(element,catalog,geo,{onPoint,onPick,canPick=()=>true,trail=[],routeStops=[],inside=()=>true}={}){
 const T=await loadTencent(catalog.map.tencentKey);if(!element.isConnected)return detached();
 element.replaceChildren();let map,orientation,zoomControls,outside,escape,layers=[],destroyed=false,loadTimer,settleLoad;
 element.classList.add('tencent-map-root');const surface=document.createElement('div');surface.className='tencent-map-surface';element.append(surface);
 const ll=p=>{const c=toTencent(p);return new T.LatLng(c.lat,c.lng);};
 const bounds=points=>{const first=ll(points[0]),b=new T.LatLngBounds(first,first);for(const p of points.slice(1))b.extend(ll(p));return b;};
 const cleanup=()=>{if(destroyed)return;destroyed=true;clearTimeout(loadTimer);settleLoad?.(Error('地图页面已关闭'));document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);orientation?.remove();zoomControls?.remove();for(const layer of layers)layer.destroy();map?.destroy();element.classList.remove('tencent-map-root');};
 try{
  // 3D mode at zero pitch keeps the initial overhead view and enables the compass.
  map=new T.Map(surface,{center:ll(catalog.campus.center),zoom:16,minZoom:14,maxZoom:20,pitch:0,rotation:0,viewMode:'3D',rotatable:true,pitchable:true,scrollable:true,touchZoomable:true});
  map.removeControl(T.constants.DEFAULT_CONTROL_ID.ROTATION);
  map.removeControl(T.constants.DEFAULT_CONTROL_ID.ZOOM);
  orientation=document.createElement('div');orientation.className='map-orientation';orientation.setAttribute('role','group');orientation.setAttribute('aria-label','地图视角');
  orientation.innerHTML='<button type="button" data-view="left" aria-label="向左旋转45度" title="向左旋转45°">↶</button><button type="button" class="map-compass" data-view="north" aria-label="恢复正北与俯视" title="恢复正北与俯视"><svg class="map-compass-arrow" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 2 21 24 14 19 7 24Z" fill="#347cc9"/><path d="M14 2 14 19 7 24Z" fill="#e85a56"/><text x="14" y="13" text-anchor="middle" font-size="7" fill="white">N</text></svg></button><button type="button" data-view="right" aria-label="向右旋转45度" title="向右旋转45°">↷</button><button type="button" class="map-view-switch" data-view="pitch" aria-pressed="false">倾斜视角</button>';
  const panel=document.createElement('div');panel.className='map-view-popover';panel.id='map-view-'+(++sequence);panel.innerHTML=orientation.innerHTML;orientation.innerHTML='';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='button secondary map-view-toggle';toggle.setAttribute('aria-label','调整地图视角');toggle.setAttribute('aria-controls',panel.id);toggle.innerHTML='<svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true"><path d="m14 3 8 21-8-5-8 5Z" fill="#347cc9"/><path d="m14 3 0 16-8 5Z" fill="#e85a56"/></svg>';
  orientation.append(toggle,panel);
  const open=value=>{orientation.classList.toggle('is-open',value);toggle.setAttribute('aria-expanded',String(value));panel.setAttribute('aria-hidden',String(!value));panel.inert=!value;};open(false);
  toggle.addEventListener('click',()=>open(toggle.getAttribute('aria-expanded')!=='true'));
  outside=e=>{if(!orientation.contains(e.target))open(false);};escape=e=>{if(e.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){open(false);toggle.focus();}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);
  const arrow=panel.querySelector('.map-compass-arrow'),tilt=panel.querySelector('[data-view="pitch"]');
  let compassRotation=0;
  const syncView=()=>{if(destroyed)return;const delta=-map.getRotation()-compassRotation;compassRotation+=((delta+180)%360+360)%360-180;arrow.style.transform=`rotate(${compassRotation}deg)`;const tilted=map.getPitch()>1;tilt.setAttribute('aria-pressed',String(tilted));tilt.textContent=tilted?'俯视视角':'倾斜视角';};
  // Controls are siblings of the SDK surface. Let events reach the global glass feedback layer.
  orientation.addEventListener('click',e=>{if(destroyed)return;const view=e.target.closest('[data-view]')?.dataset.view;if(view==='left'||view==='right')map.setRotation(map.getRotation()+(view==='right'?45:-45));else if(view==='north'){map.setRotation(0);map.setPitch(0);}else if(view==='pitch')map.setPitch(map.getPitch()>1?0:45);syncView();});
  map.on('rotate',syncView);map.on('pitch',syncView);syncView();element.append(orientation);
  zoomControls=document.createElement('div');zoomControls.className='map-zoom';zoomControls.setAttribute('role','group');zoomControls.setAttribute('aria-label','地图缩放');
  zoomControls.innerHTML='<button type="button" class="button secondary" data-zoom="1" aria-label="放大地图">+</button><button type="button" class="button secondary" data-zoom="-1" aria-label="缩小地图">−</button>';
  const zoomIn=zoomControls.querySelector('[data-zoom="1"]'),zoomOut=zoomControls.querySelector('[data-zoom="-1"]');
  const syncZoom=()=>{if(destroyed)return;zoomIn.disabled=map.getZoom()>=20;zoomOut.disabled=map.getZoom()<=14;};
  zoomControls.addEventListener('click',e=>{if(destroyed)return;const step=Number(e.target.closest('[data-zoom]')?.dataset.zoom);if(step){map.setZoom(Math.max(14,Math.min(20,map.getZoom()+step)));syncZoom();}});map.on('zoom',syncZoom);syncZoom();element.append(zoomControls);
  const notice=document.createElement('div');notice.className='map-status tencent-map-status';notice.setAttribute('role','status');notice.textContent='正在连接腾讯在线地图…';element.append(notice);
  const ready=new Promise((resolve,reject)=>{let settled=false;settleLoad=error=>{if(settled)return;settled=true;clearTimeout(loadTimer);error?reject(error):resolve();};map.on('tilesloaded',()=>settleLoad());loadTimer=setTimeout(()=>settleLoad(Error('腾讯底图加载超时，请检查 Key、域名白名单或网络')),15000);});
  // Observe a possible rejection immediately while layers are being constructed.
  ready.catch(()=>{});
  const layer=(Kind,options)=>{const x=new Kind({map,...options});layers.push(x);return x;};
  layer(T.MultiPolygon,{id:'campus-boundary',disableInteractive:true,styles:{campus:new T.PolygonStyle({color:'rgba(70,129,188,.04)',showBorder:true,borderColor:'#668a9c',borderWidth:2})},geometries:[{id:'campus',styleId:'campus',paths:catalog.campus.boundary.map(ll)}]});
  const label={direction:'bottom',offset:{x:0,y:7},size:12,color:'#25495c',strokeColor:'#fff',strokeWidth:3};
  const styles={reference:new T.MarkerStyle({...label,width:36,height:44,anchor:{x:18,y:41},src:pin('#2f7765')}),community:new T.MarkerStyle({...label,width:36,height:44,anchor:{x:18,y:41},src:pin('#80966a')}),selected:new T.MarkerStyle({...label,width:44,height:52,anchor:{x:22,y:48},src:pin('#236cd1','●',true)})};
  const geometries=catalog.points.map(p=>{const number=routeStops.findIndex(s=>s.id===p.id)+1;if(number&&!styles['stop'+number])styles['stop'+number]=new T.MarkerStyle({...label,width:36,height:44,anchor:{x:18,y:41},src:pin('#5276c7',number)});return {id:p.id,styleId:number?'stop'+number:p.trust==='community'?'community':'reference',position:ll(p),properties:{name:p.name},content:p.name,rank:100};});
  const points=layer(T.MultiMarker,{id:'campus-points',styles,geometries,isStopPropagation:true,zIndex:110});
  const controls=layer(T.MultiMarker,{id:'campus-positions',disableInteractive:true,zIndex:140,styles:{pick:new T.MarkerStyle({width:36,height:44,anchor:{x:18,y:41},src:pin('#236cd1','＋')}),start:new T.MarkerStyle({width:36,height:44,anchor:{x:18,y:41},src:pin('#2f7765','起')}),end:new T.MarkerStyle({width:36,height:44,anchor:{x:18,y:41},src:pin('#df644f','终')}),gps:new T.MarkerStyle({width:24,height:24,anchor:{x:12,y:12},src:svg('<circle cx="20" cy="24" r="11" fill="#2879ff" stroke="white" stroke-width="4"/>')})},geometries:[]});
  let picked=null,locationPoint=null,endpoints=[],viewPoints=catalog.campus.boundary;
  const positions=()=>controls.setGeometries([...(picked?[{id:'pick',styleId:'pick',position:ll(picked)}]:[]),...(locationPoint?[{id:'gps',styleId:'gps',position:ll(locationPoint)}]:[]),...endpoints.map(([p,label])=>({id:label,styleId:label,position:ll(p)}))]);
  const accuracy=layer(T.MultiCircle,{id:'position-accuracy',disableInteractive:true,styles:{gps:new T.CircleStyle({color:'rgba(40,121,255,.08)',borderColor:'#2879ff',borderWidth:1})},geometries:[]});
  const lineStyles={blue:new T.PolylineStyle({color:'#5276c7',width:5,borderColor:'#fff',borderWidth:2,lineCap:'round'}),blueDash:new T.PolylineStyle({color:'#5276c7',width:3,dashArray:[4,7]}),green:new T.PolylineStyle({color:'#31846c',width:5,borderColor:'#fff',borderWidth:2}),greenDash:new T.PolylineStyle({color:'#31846c',width:3,dashArray:[4,7]}),trail:new T.PolylineStyle({color:'#ec6a3a',width:4,lineCap:'round'})};
  const lines=(id)=>layer(T.MultiPolyline,{id,disableInteractive:true,styles:lineStyles,geometries:[]});
  const references=lines('route-reference'),navigation=lines('walking-guide'),track=lines('recorded-trail');
  const reference={legs:[],length:0,missing:0,loading:routeStops.length>1};let planGeneration=0,guideLeg=null,guideTarget=null,guideAt=0,guidePending=null,offRouteFixes=0;
  const legLines=(leg,id,color)=>!leg.available?[]:[{id,styleId:color,paths:leg.path.map(ll)},...leg.connectors.filter(c=>c.length>1).map((c,i)=>({id:id+'-approach-'+i,styleId:color+'Dash',paths:c.map(ll)}))];
  const referenceReady=(async()=>{for(let i=1;i<routeStops.length;i++){const leg=await campusWalking(T,catalog.map.tencentKey,routeStops[i-1],routeStops[i],{campus:catalog.campus,alive:()=>!destroyed});if(destroyed)return reference;reference.legs.push(leg);if(leg.available)reference.length+=leg.length;else{reference.missing++;reference.reason=leg.reason;if([110,111,112,113,121,190,199].includes(leg.status)){reference.missing+=routeStops.length-1-i;break;}}references.setGeometries(reference.legs.flatMap((leg,i)=>legLines(leg,'leg'+i,'blue')));}reference.loading=false;return reference;})();
  const fit=points=>{if(!destroyed&&points.length){viewPoints=points;map.fitBounds(bounds(points),{padding:48,maxZoom:18});}};
  const move=p=>{viewPoints=[p];map.easeTo({center:ll(p),zoom:18},{duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:350});};
  let visibleIds=null,selectedId=null;const repaint=()=>points.setGeometries(geometries.filter(g=>!visibleIds||visibleIds.has(g.id)).map(g=>({...g,styleId:g.id===selectedId?'selected':g.styleId,rank:g.id===selectedId?1000:100})));
  const select=(id,{pan=true}={})=>{if(destroyed)return;selectedId=id;repaint();const p=catalog.points.find(p=>p.id===id);if(p&&pan)move(p);};
  points.on('click',e=>{if(destroyed)return;const p=catalog.points.find(p=>p.id===e.geometry?.id);if(p){select(p.id);onPoint?.(p.id);}});
  map.on('click',e=>{if(destroyed||!onPick||!canPick()||!e.latLng)return;const p=fromTencent({lng:e.latLng.getLng(),lat:e.latLng.getLat()});if(onPick(p)===false)return;picked=p;positions();});
  map.on('context_lost',()=>{if(!destroyed){notice.textContent='腾讯地图显示中断，请刷新页面重试';element.append(notice);}});
  const overview=()=>fit(routeStops.length>1?routeStops:catalog.campus.boundary);overview();
  const updateTrail=values=>{if(!destroyed)track.setGeometries(values.length>1?[{id:'trail',styleId:'trail',paths:values.map(ll)}]:[]);};updateTrail(trail);
  const resized=()=>{if(!destroyed)fit(viewPoints);};map.on('resize',resized);
  const adapter={provider:'tencent',reference,referenceReady,metadata:{provider:'tencent'},overview,select,filter(ids){if(destroyed)return;visibleIds=new Set(ids);if(!visibleIds.has(selectedId))selectedId=null;repaint();},focus(id){select(id);},pick(p){if(!destroyed){picked=p;positions();}},trail:updateTrail,
   locate(p,{follow=true}={}){if(destroyed||!element.isConnected)return;locationPoint=p;positions();const radius=Number.isFinite(p.accuracy)?Math.max(1,p.accuracy):1;accuracy.setGeometries([{id:'gps',styleId:'gps',center:ll(p),radius}]);if(follow&&inside(p,catalog.campus))map.panTo(ll(p));},
   async plan(start,target,{fit:shouldFit=true}={}){const id=++planGeneration;if(destroyed)return {available:false,reason:'地图页面已关闭'};navigation.setGeometries([]);endpoints=[];positions();const leg=await campusWalking(T,catalog.map.tencentKey,start,target,{campus:catalog.campus,alive:()=>!destroyed&&id===planGeneration});if(destroyed||id!==planGeneration)return {available:false,reason:'路线请求已取消'};navigation.setGeometries(legLines(leg,'plan','blue'));endpoints=leg.available?[[start,'start'],[target,'end']]:[];positions();if(leg.available&&shouldFit)fit([start,target,...leg.path]);return leg;},
   async navigation(p,target){
    if(destroyed)return null;
    if(!p||!target){planGeneration++;guideLeg=null;guideTarget=null;guidePending=null;offRouteFixes=0;navigation.setGeometries([]);endpoints=[];positions();return null;}
    const targetId=target.id||target.lng+','+target.lat;
    if(guideTarget===targetId&&guideLeg&&!guideLeg.available&&Date.now()-guideAt<30000)return guideLeg;
    if(guideTarget===targetId&&guideLeg?.available){const progress=routeProgress(guideLeg.path,p);offRouteFixes=progress.gap>Math.max(35,p.accuracy*1.5)?offRouteFixes+1:0;if(offRouteFixes<2||Date.now()-guideAt<30000)return guideLeg;}
    if(guidePending&&guideTarget===targetId)return guidePending;
    guideTarget=targetId;const id=++planGeneration;guideAt=Date.now();offRouteFixes=0;
    guidePending=campusWalking(T,catalog.map.tencentKey,p,target,{campus:catalog.campus,alive:()=>!destroyed&&id===planGeneration}).then(leg=>{if(destroyed||id!==planGeneration)return null;guideLeg=leg;navigation.setGeometries(legLines(leg,'guide','green'));guidePending=null;return leg;});return guidePending;
   },destroy:cleanup};
  await ready;if(!element.isConnected){cleanup();return detached();}notice.remove();return adapter;
 }catch(error){cleanup();throw error;}
}
