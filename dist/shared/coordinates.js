// WGS84 remains the storage / routing format. Convert only at the Tencent display boundary.
// Adapted from wandergis/coordtransform (MIT); see coordtransform-LICENSE.txt.
const PI=Math.PI,A=6378245,EE=.00669342162296594323;
function point(p){const lng=Array.isArray(p)?p[0]:p.lng,lat=Array.isArray(p)?p[1]:p.lat;if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)throw Error('地图坐标无效');return {lng,lat};}
const outside=p=>!(p.lng>73.66&&p.lng<135.05&&p.lat>3.86&&p.lat<53.55);
export function toTencent(p){
 const {lng,lat}=point(p);if(outside({lng,lat}))return {lng,lat};
 const x=lng-105,y=lat-35,s=(v)=>Math.sin(v*PI);
 let dy=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
 dy+=(20*s(6*x)+20*s(2*x))*2/3+(20*s(y)+40*s(y/3))*2/3+(160*s(y/12)+320*s(y/30))*2/3;
 let dx=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
 dx+=(20*s(6*x)+20*s(2*x))*2/3+(20*s(x)+40*s(x/3))*2/3+(150*s(x/12)+300*s(x/30))*2/3;
 const rad=lat/180*PI,magic=1-EE*Math.sin(rad)**2,root=Math.sqrt(magic);
 return {lng:lng+dx*180/(A/root*Math.cos(rad)*PI),lat:lat+dy*180/(A*(1-EE)/(magic*root)*PI)};
}
export function fromTencent(p){
 const target=point(p);if(outside(target))return target;
 let result={...target};for(let i=0;i<6;i++){const forward=toTencent(result);result={lng:result.lng+target.lng-forward.lng,lat:result.lat+target.lat-forward.lat};}return result;
}
