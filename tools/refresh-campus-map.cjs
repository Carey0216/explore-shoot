// Refresh public campus geometry only. No account data, keys or GPS are sent.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),bbox=[106.0905,38.4929,106.1092,38.5007];
async function main(){
 const file=process.argv.indexOf('--from');
 let data;
 if(file>=0)data=JSON.parse(fs.readFileSync(path.resolve(process.argv[file+1]),'utf8'));
 else{const response=await fetch('https://api.openstreetmap.org/api/0.6/map.json?bbox='+bbox.join(','),{headers:{'User-Agent':'ExploreShoot/3.0 campus prototype'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('OSM 返回 '+response.status);data=await response.json();}
 if(!Array.isArray(data.elements))throw Error('地图数据格式无效，保留原有资料');
 const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
 const within=n=>n&&Number.isFinite(n.lon)&&Number.isFinite(n.lat)&&n.lon>=bbox[0]&&n.lon<=bbox[2]&&n.lat>=bbox[1]&&n.lat<=bbox[3];
 const features=[];
 for(const e of data.elements){if(e.type!=='way'||!e.tags)continue;const t=e.tags,kind=e.id===461608579?'campus':t.building?'building':t.highway||t.leisure||t.landuse;if(!kind)continue;const ns=e.nodes.map(id=>nodes.get(id));if(ns.some(n=>!n))continue;const polygon=!t.highway&&e.nodes[0]===e.nodes.at(-1);if(polygon&&ns.some(n=>!within(n)))continue;
  const chunks=[];let current=[];for(const n of ns){if(within(n))current.push(n);else{if(current.length>1)chunks.push(current);current=[];}}if(current.length>1)chunks.push(current);
  for(const part of polygon?[ns]:chunks){features.push({type:'Feature',properties:{id:e.id,name:t.name||'',kind,updatedAt:e.timestamp,...(t.highway?{nodeIds:part.map(n=>n.id),access:t.access,foot:t.foot,footOneway:t['oneway:foot'],barriers:part.map(n=>n.tags?.barrier&&['no','private'].includes(n.tags?.access)&&!['yes','designated','permissive'].includes(n.tags?.foot)?true:false)}:{})},geometry:{type:polygon?'Polygon':'LineString',coordinates:polygon?[part.map(n=>[n.lon,n.lat])]:part.map(n=>[n.lon,n.lat])}});}
 }
 if(!features.some(f=>f.properties.kind==='campus')||features.filter(f=>f.geometry.type==='LineString').length<10)throw Error('地图资料不完整，保留原有资料');
 const roads=features.filter(f=>f.geometry.type==='LineString'),geo={type:'FeatureCollection',metadata:{source:'OpenStreetMap',sourceURL:'https://www.openstreetmap.org/way/461608579',license:'ODbL',coordinateSystem:'WGS84',fetchedAt:new Date().toISOString(),latestRoadEdit:roads.map(f=>f.properties.updatedAt).filter(Boolean).sort().at(-1),roadCount:roads.length,notice:'获取时间不等于道路实地更新时间；公开道路资料可能不完整，通行情况以现场为准。'},features};
 const target=path.join(root,'dist/shared/campus.geojson');fs.writeFileSync(target+'.tmp',JSON.stringify(geo));fs.renameSync(target+'.tmp',target);console.log('已更新校园地理资料：'+features.length+' 个要素，'+roads.length+' 段道路；获取于 '+geo.metadata.fetchedAt);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
