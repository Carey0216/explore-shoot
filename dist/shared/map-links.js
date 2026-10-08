import {tencentLinks} from './tencent-links.js';
import {toTencent,toBaidu} from './coordinates.js';
export function mapLinks(provider,target,origin,settings={}, {mobile=false,platform='android'}={}){
 if(provider==='tencent')return tencentLinks(target,origin,settings.tencentKey,{mobile});
 if(provider==='amap'){
  const to=toTencent(target),from=origin?toTencent(origin):null;
  const params={to:[to.lng,to.lat,String(target.name).replace(/[,;|]/g,' ')].join(','),mode:'walk',coordinate:'gaode',src:'explore-shoot',callnative:mobile?'1':'0'};
  if(from)params.from=[from.lng,from.lat,String(origin.name||'当前位置').replace(/[,;|]/g,' ')].join(',');
  const web='https://uri.amap.com/navigation?'+new URLSearchParams({...params,callnative:'0'});
  return {native:mobile?'https://uri.amap.com/navigation?'+new URLSearchParams(params):null,web};
 }
 const to=toBaidu(target),from=origin?toBaidu(origin):null;
 const destination=to.lat.toFixed(6)+','+to.lng.toFixed(6),source=platform==='ios'?'ios.exploreshoot.web':'andr.exploreshoot.web';
 // Without an explicit origin, let the App select its own current position via marker.
 const native=mobile?'baidumap://map/'+(from?'direction?'+new URLSearchParams({origin:from.lat.toFixed(6)+','+from.lng.toFixed(6),destination,coord_type:'bd09ll',mode:'walking',src:source}):'marker?'+new URLSearchParams({location:destination,title:target.name,content:'北方民族大学',coord_type:'bd09ll',src:source})):null;
 const web='https://api.map.baidu.com/marker?'+new URLSearchParams({location:destination,title:target.name,content:'北方民族大学',coord_type:'bd09ll',output:'html',src:'webapp.exploreshoot.web'});
 return {native,web};
}
