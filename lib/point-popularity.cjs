const S=require('./security.cjs');
const MAX=1_000_000_000,WINDOW=30*60*1000;
function stats(point){const viewCount=Math.max(0,Number.isSafeInteger(point.viewCount)?point.viewCount:0),offset=Number.isSafeInteger(point.popularityOffset)?point.popularityOffset:0;return {viewCount,popularity:Math.max(0,Math.min(MAX,viewCount+offset)),popularityAdjusted:offset!==0};}
function adjustment(point,body){
 if(Object.keys(body).some(k=>!['popularity','useActual'].includes(k)))S.fail('热度参数无效');
 if(body.useActual===true&&Object.keys(body).length===1)return 0;
 if(Object.keys(body).length!==1||!Number.isSafeInteger(body.popularity)||body.popularity<0||body.popularity>MAX)S.fail('热度需为 0—1000000000 的整数');
 return body.popularity-stats(point).viewCount;
}
function counter(){const seen=new Map();return {
 record(point,clientId,save,now=Date.now()){
  if(typeof clientId!=='string'||!/^[a-f0-9-]{36}$/.test(clientId))S.fail('浏览标识无效');
  const key=S.digest(clientId+':'+point.id),previous=seen.get(key);
  if(previous!==undefined&&now-previous<WINDOW)return {...stats(point),counted:false};
  for(const [id,at] of seen)if(now-at>=WINDOW)seen.delete(id);
  while(seen.size>=20000)seen.delete(seen.keys().next().value);
  const old=point.viewCount;point.viewCount=Math.min(MAX,stats(point).viewCount+1);
  try{save();}catch(error){if(old===undefined)delete point.viewCount;else point.viewCount=old;throw error;}
  seen.set(key,now);return {...stats(point),counted:true};
 }
};}
module.exports={stats,adjustment,counter,WINDOW};
