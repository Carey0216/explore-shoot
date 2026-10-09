import {$,esc,icon,modal,closeModal,toast} from './ui.js';
import {mapLinks} from './map-links.js';
export const mapChoices=Object.freeze([{id:'tencent',name:'腾讯地图'},{id:'amap',name:'高德地图'},{id:'baidu',name:'百度地图'},{id:'apple',name:'苹果地图'}]);
export function mapPlatform(ua=navigator.userAgent||'',touch=navigator.maxTouchPoints||0){return /iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&touch>1)?'ios':/Android/.test(ua)?'android':null;}
export function mapChooserHTML(target,origin,settings,platform,{canNavigate=false}={}){
 const rows=mapChoices.map(({id,name})=>{const {native,web}=mapLinks(id,target,origin,settings,{mobile:!!platform,platform});return `<div class="map-choice-row"><a class="button secondary map-choice" href="${esc(native||web)}" ${native?'':'target="_blank" rel="noopener noreferrer"'} data-map-choice="${id}"><span class="map-choice-icon ${id}">${icon('map')}</span><span><b>${name}</b><small>${native?'打开已安装的 App':'打开地图网页版'}</small></span><span class="map-choice-chevron" aria-hidden="true">↗</span></a>${native?`<a class="map-choice-fallback" href="${esc(web)}" target="_blank" rel="noopener noreferrer" aria-label="${name}网页版">网页版 ↗</a>`:''}</div>`;}).join('');
 return `<p class="map-app-destination" data-i18n-skip>${esc(target.name)}</p><p class="map-choice-origin" data-i18n-skip>${origin?'从 '+esc(origin.name||'当前位置')+' 出发':'未提供起点，请在所选地图中确认出发位置。'}</p><button class="button secondary map-choice map-choice-local" id="light-navigation"><span class="map-choice-icon local">${icon('walk')}</span><span><b>探索与拍摄 · 轻地图</b><small>${canNavigate?'在本页开始全屏步行导航':'无需下载，先查看校园路线'}</small></span><span class="map-choice-chevron" aria-hidden="true">›</span></button><div class="map-choices">${rows}</div><p class="map-choice-note">手机 App 需已安装，浏览器可能询问是否打开；未成功时可选网页版。各地图独立规划路线，请核对现场入口。</p><div class="map-choice-tools"><button class="text-btn" id="copy-destination">复制目的地</button><button class="button secondary" id="map-choice-cancel">取消</button></div>`;
}
export function mapApps(target,origin,settings={},options={}){
 const platform=mapPlatform();
 const d=modal('选择地图',mapChooserHTML(target,origin,settings,platform,{canNavigate:options.canNavigate??!!options.onLightMap}),d=>{
  $('#light-navigation',d).onclick=()=>{closeModal();if(options.onLightMap)options.onLightMap();else window.dispatchEvent(new CustomEvent('navigation:destination',{detail:{id:target.id}}));};
  $('#map-choice-cancel',d).onclick=closeModal;
  $('#copy-destination',d).onclick=async()=>{const text=`${target.name} · 北方民族大学\nGPS 坐标（WGS84）：${target.lng.toFixed(6)}, ${target.lat.toFixed(6)}`;try{await navigator.clipboard.writeText(text);toast('目的地已复制');}catch{toast('浏览器未允许复制：'+text);}};
 });d.classList.add('map-chooser');return d;
}
