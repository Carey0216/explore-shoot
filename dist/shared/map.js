import {esc} from './ui.js';
import {tencentMap} from './tencent-map.js';
import {alternativeMap} from './alternative-map.js';
import {mapProvider,providerName} from './map-provider.js';
export async function campusMap(element,catalog,options={}){
 if(['amap','baidu'].includes(mapProvider(catalog))){element.innerHTML='<div class="map-loading" role="status"><span></span>正在打开'+providerName(catalog)+'…</div>';try{return await alternativeMap(element,catalog,options);}catch(e){return unavailable(element,e.message);}}
 if(catalog.map?.tencentKey){
  element.innerHTML='<div class="map-loading" role="status"><span></span>正在打开腾讯地图…</div>';
  try{return await tencentMap(element,catalog,{features:[]},{...options,inside:inCampus});}catch(e){return unavailable(element,e.message);}
 }
 return unavailable(element,'腾讯地图尚未配置，请联系管理员');
}
function unavailable(element,reason){
 if(element.isConnected){element.innerHTML='<div class="map-unavailable" role="status"><strong>地图暂不可用</strong><p>'+esc(reason)+'</p><button type="button" class="button secondary map-retry">重新连接</button><small>不会使用旧道路资料代替在线路线，请稍后重试。</small></div>';element.querySelector('.map-retry').onclick=()=>location.reload();}
 const reference={legs:[],length:0,missing:1,reason};return {provider:'unavailable',reference,referenceReady:Promise.resolve(reference),overview(){},select(){},focus(){},pick(){},trail(){},locate(){},async navigation(){return null;},async plan(){return {available:false,reason};},destroy(){}};
}
export function inCampus(p,campus){let inside=false;const b=campus.boundary;for(let i=0,j=b.length-1;i<b.length;j=i++){if((b[i][1]>p.lat)!==(b[j][1]>p.lat)&&p.lng<(b[j][0]-b[i][0])*(p.lat-b[i][1])/(b[j][1]-b[i][1])+b[i][0])inside=!inside;}return inside;}
