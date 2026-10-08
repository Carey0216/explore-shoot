export const mapProvider=catalog=>['tencent','amap','baidu'].includes(catalog?.map?.provider)?catalog.map.provider:'tencent';
export const providerName=catalog=>({tencent:'腾讯地图',amap:'高德地图',baidu:'百度地图'}[mapProvider(catalog)]);
export const providerCopy=(text,catalog)=>text.replaceAll('腾讯地图',providerName(catalog)).replaceAll('腾讯',providerName(catalog).replace('地图',''));
export const mapConfigured=catalog=>!!catalog?.map?.[{tencent:'tencentKey',amap:'amapKey',baidu:'baiduKey'}[mapProvider(catalog)]];
export const locationNotice=catalog=>mapProvider(catalog)==='baidu'?'浏览器处理精确定位；百度处理地图与算路。':'定位组件与算路由'+providerName(catalog)+'提供。';
