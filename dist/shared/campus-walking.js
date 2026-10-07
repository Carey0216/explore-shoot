import {tencentWalking} from './tencent-services.js';
import {distance} from './routing.js';
// Public road entrance returned by Tencent Walking on 2026-10-07; WGS84 internally.
const northBridgeEast={lng:106.09724143949414,lat:38.4984095985414};
export function insideBoundary(point,campus){const p=Array.isArray(point)?{lng:point[0],lat:point[1]}:point,b=campus?.boundary;if(!b?.length)return true;let included=false;for(let i=0,j=b.length-1;i<b.length;j=i++){const a=b[i],c=b[j];if((a[1]>p.lat)!==(c[1]>p.lat)&&p.lng<(c[0]-a[0])*(p.lat-a[1])/(c[1]-a[1])+a[0])included=!included;}return included;}
export function leavesCampus(leg,campus){return leg.available&&(leg.path.some(p=>!insideBoundary(p,campus))||leg.steps?.some(s=>/广武巷|宁朔街辅路/.test(s.instruction)));}
export function joinLegs(legs){
 if(legs.some(l=>!l.available))return null;
 for(let i=1;i<legs.length;i++)if(distance(legs[i-1].path.at(-1),legs[i].path[0])>5)return null;
 const first=legs[0],last=legs.at(-1),length=legs.reduce((n,l)=>n+l.length,0);
 return {...first,path:legs.flatMap((l,i)=>i?l.path.slice(1):l.path),connectors:[],length,lengthWithApproach:length,duration:legs.reduce((n,l)=>n+l.duration,0),endGap:last.endGap,approach:last.approach,steps:legs.flatMap(l=>l.steps||[])};
}
export async function campusWalking(T,key,start,target,{campus,alive=()=>true,walking=tencentWalking}={}){
 const direct=await walking(T,key,start,target,{alive});
 const crossing=(start.lng<106.0968)!==(target.lng<106.0968);
 if(!direct.available||!crossing||!leavesCampus(direct,campus)||!alive())return direct;
 const legs=[];for(const [a,b] of [[start,northBridgeEast],[northBridgeEast,target]]){if(!alive())return {available:false,reason:'路线请求已取消'};const leg=await walking(T,key,a,b,{alive});if(!leg.available)return {...direct,policyWarning:'腾讯暂未返回连通的校内路线，当前路线仍有校外路段。请查看步骤并确认通行。'};legs.push(leg);}
 const joined=joinLegs(legs);
 if(!joined||leavesCampus(joined,campus))return {...direct,policyWarning:'腾讯暂未返回连通的校内路线，当前路线仍有校外路段。请查看步骤并确认通行。'};
 return {...joined,campusPreferred:true,policyNote:'校内优先：腾讯当前未返回南侧天桥的连通路线，已改走校内道路与北侧天桥。'};
}
