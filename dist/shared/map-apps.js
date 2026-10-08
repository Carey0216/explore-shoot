import {$,esc,modal,toast} from './ui.js';
import {mapLinks} from './map-links.js';
import {providerName,mapProvider,locationNotice} from './map-provider.js';
export function mapApps(target,origin,settings={}){
 const ua=navigator.userAgent||'',platform=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'ios':/Android/.test(ua)?'android':null;
 const catalog={map:settings},provider=mapProvider(catalog),name=providerName(catalog),{native,web}=mapLinks(provider,target,origin,settings,{mobile:!!platform,platform});
 modal('用地图打开',`<p class="map-app-destination">${esc(target.name)}</p><p class="muted">${origin?'从 '+esc(origin.name||'当前位置')+' 出发':'未提供起点，打开地图后请选择起点。'}</p>${native?`<a class="button wide" href="${esc(native)}">打开${name} App</a><p class="muted">需要已安装${name}。若没有响应，请在 Safari / Chrome 等系统浏览器打开本页面，或使用下方网页版。</p>`:'<p class="muted">当前为电脑浏览器，可使用本项目步行导航，或在下方地图查看目的地。</p>'}<a class="button secondary wide" href="${esc(web)}" target="_blank" rel="noopener noreferrer">${provider==='tencent'&&platform?'腾讯手机网页版步行路线 ↗':name+' 网页版 ↗'}</a><button class="text-btn wide" id="copy-destination">复制目的地，粘贴到其他地图</button><p class="muted">只在点击打开时向地图服务提供起终点坐标。${locationNotice(catalog)}本项目不保存导航位置。</p>`,d=>{$('#copy-destination',d).onclick=async()=>{const text=`${target.name} · 北方民族大学\nGPS 坐标（WGS84）：${target.lng.toFixed(6)}, ${target.lat.toFixed(6)}`;try{await navigator.clipboard.writeText(text);toast('目的地已复制');}catch{toast('浏览器未允许复制：'+text);}};});
}
