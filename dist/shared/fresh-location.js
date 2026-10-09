// Browser sensor timestamps are kept intact: receiving an old fix does not make it new.
let sequence=0;const watches=new Map();
export function freshBrowserLocation(sensor=navigator.geolocation){
 function request(success,error,options={},continuous=false,onDispose=()=>{}){
  const started=Date.now(),timeout=Math.max(5000,Math.min(60000,options.timeout||20000));
  const config={enableHighAccuracy:true,maximumAge:0,timeout};
  let sensorGeneration=0,active=true,watchId=null,timer=null,lastTimestamp=0,lastGood=started,hasFix=false,probePending=false,probeStarted=0,lastProbe=started,recovering=false;
  function cleanup(){if(!active)return;active=false;sensorGeneration++;onDispose();if(watchId!==null)sensor.clearWatch(watchId);clearInterval(timer);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',cancel);}
  function fail(reason){if(!active)return;cleanup();error?.(reason);}
  function cancel(){cleanup();}
  function hidden(){if(document.hidden)fail({code:2,freshness:true,message:'页面已切到后台，定位已停止。返回后请重新开启导航。'});}
  function receive(value){
   if(!active)return;
   const c=value?.coords,t=value?.timestamp,now=Date.now();
   if(!c||!Number.isFinite(c.longitude)||!Number.isFinite(c.latitude)||Math.abs(c.longitude)>180||Math.abs(c.latitude)>90||!Number.isFinite(c.accuracy)||c.accuracy<=0||c.accuracy>80||!Number.isFinite(t)||t<started-1000||t<now-10000||t>now+1000||t<=lastTimestamp)return;
   lastTimestamp=t;lastGood=now;hasFix=true;recovering=false;
   const result={coords:{longitude:c.longitude,latitude:c.latitude,accuracy:c.accuracy},timestamp:t};
   if(!continuous)cleanup();success(result);
  }
  // Permission denial is terminal; transient sensor errors get a bounded recovery window.
  function sensorError(reason){if(!active)return;if(reason?.code===1)fail(reason);}
  function startWatch(){if(!active)return;if(watchId!==null)sensor.clearWatch(watchId);watchId=null;
   const generation=++sensorGeneration;
   try{const id=sensor.watchPosition(p=>{if(generation===sensorGeneration)receive(p);},e=>{if(generation===sensorGeneration)sensorError(e);},config);if(active)watchId=id;else sensor.clearWatch(id);}catch(e){fail({code:2,freshness:true,message:'浏览器无法启动精确定位，请检查定位权限后重试。'});}
  }
  function probe(){if(!active||probePending)return;probePending=true;probeStarted=lastProbe=Date.now();
   const current=probeStarted;
   try{sensor.getCurrentPosition(p=>{if(!active||current!==probeStarted)return;probePending=false;receive(p);},e=>{if(!active||current!==probeStarted)return;probePending=false;sensorError(e);},{...config,timeout:10000});}
   catch{probePending=false;}
  }
  function tick(){if(!active)return;const now=Date.now(),quiet=now-lastGood;
   if(quiet>=(hasFix?30000:timeout)){fail({code:3,freshness:true,message:hasFix?'定位长时间未更新，导航已暂停。请点击「用我的位置」重新获取。':'未获得新的精确位置，请到室外重试，并检查浏览器的定位权限。'});return;}
   if(probePending&&now-probeStarted>=10000){probePending=false;probeStarted=0;}
   if(quiet>=10000&&now-lastProbe>=10000){if(!recovering){recovering=true;options.onStatus?.('定位暂未更新，正在重新获取…');}startWatch();probe();}
  }
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',cancel);
  if(document.hidden){hidden();return cancel;}
  timer=setInterval(tick,1000);startWatch();probe();return cancel;
 }
 return {getCurrentPosition(success,error,options){return request(success,error,options);},watchPosition(success,error,options){const id=++sequence;
  // Register before starting the sensor, so even synchronous mock callbacks can clear it.
  const entry={cancel:null,done:false};watches.set(id,entry);
  entry.cancel=request(success,e=>{watches.delete(id);error?.(e);},options,true,()=>watches.delete(id));if(entry.done)entry.cancel();return id;
 },clearWatch(id){const entry=watches.get(id);if(!entry)return;entry.done=true;entry.cancel?.();watches.delete(id);}};
}
