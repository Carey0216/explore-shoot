const loaded=new Map(),pending=new Map();let sequence=0;
export function loadAlternative(provider,config){
 if(!['amap','baidu'].includes(provider))return Promise.reject(Error('地图服务无效'));const key=config?.[provider==='amap'?'amapKey':'baiduKey'];if(!key)return Promise.reject(Error('地图尚未配置，请联系管理员'));
 if(loaded.has(provider)){if(loaded.get(provider).key!==key)return Promise.reject(Error('地图配置已改变，请刷新页面'));return Promise.resolve(loaded.get(provider).sdk);}if(pending.has(provider)){const job=pending.get(provider);return job.key===key?job.promise:Promise.reject(Error('地图配置已改变，请刷新页面'));}
 const promise=new Promise((resolve,reject)=>{const script=document.createElement('script'),callback='exploreMapLoaded'+(++sequence);let settled=false;const done=error=>{if(settled)return;settled=true;clearTimeout(timer);delete window[callback];pending.delete(provider);const sdk=provider==='amap'?window.AMap:window.BMapGL;if(error||!sdk){script.remove();reject(error||Error('地图 SDK 未就绪'));}else{loaded.set(provider,{key,sdk});resolve(sdk);}};
 const timer=setTimeout(()=>done(Error('地图 SDK 加载超时，请重试')),15000);window[callback]=()=>done();script.async=true;
 if(provider==='amap'){window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};script.src='https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(key)+'&plugin=AMap.Walking,AMap.Geolocation&callback='+callback;}else script.src='https://api.map.baidu.com/api?v=1.0&type=webgl&ak='+encodeURIComponent(key)+'&callback='+callback;
 script.onerror=()=>done(Error('地图 SDK 连接失败，请检查网络或域名白名单'));document.head.append(script);
 });pending.set(provider,{key,promise});return promise;
}
