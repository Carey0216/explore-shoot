const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {roadGraph,walkingLeg,walkingRoute,distance,direction,navigationURL}=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../dist/shared/routing.js')).toString('base64'));
 const roads=lines=>({features:lines.map(coordinates=>({properties:{kind:'footway'},geometry:{type:'LineString',coordinates}}))});
 const a=[106,38],b=[106.001,38],c=[106.001,38.001];
 const graph=roadGraph(roads([[a,b,c]]));
 const leg=walkingLeg(graph,a,c);
 assert.equal(leg.available,true);assert.ok(leg.length>distance(a,c)*1.25,'Must follow an L shaped road rather than cut through a building');
 assert.deepEqual(leg.path.filter((p,i,all)=>!i||JSON.stringify(p)!==JSON.stringify(all[i-1])),[a,b,c]);
 const reverse=walkingLeg(graph,c,a);assert.ok(Math.abs(reverse.length-leg.length)<.01);
 const same=walkingLeg(graph,[106.0002,38],[106.0008,38]);assert.equal(same.path.length,2);assert.ok(Math.abs(same.length-distance(same.path[0],same.path[1]))<.01);
 const disconnected=roadGraph(roads([[a,b],[[106,38.001],c]]));assert.equal(walkingLeg(disconnected,a,c).available,false,'Disconnected roads must not produce invented paths');
 assert.equal(walkingLeg(graph,[107,39],c).available,false);
 assert.equal(walkingLeg(roadGraph({features:[]}),a,c).available,false);
 const offset=walkingLeg(graph,[106,38.0001],c);assert.ok(offset.approach>5);assert.ok(offset.lengthWithApproach>offset.length);
 assert.equal(direction([0,0],[0,1]).name,'北');assert.equal(direction([0,0],[1,0]).name,'东');assert.equal(direction([0,0],[0,-1]).name,'南');assert.equal(direction([0,0],[-1,0]).name,'西');
 const link=new URL(navigationURL({lat:38.12345678,lng:106.12345678,name:'图书馆 & 北门'},{lat:38.1,lng:106.1}));
 assert.equal(link.protocol,'https:');assert.equal(link.searchParams.get('mode'),'walking');assert.equal(link.searchParams.get('coord_type'),'wgs84');assert.equal(link.searchParams.get('destination'),'latlng:38.123457,106.123457|name:图书馆 & 北门');assert.equal(link.searchParams.get('origin'),'latlng:38.100000,106.100000|name:当前位置');
 const seed=require('../lib/campus.cjs').seed();
 const geo=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/shared/campus.geojson'),'utf8'));
 const campusGraph=roadGraph(geo);
 for(const route of seed.routes){const stops=route.points.map(id=>seed.points.find(p=>p.id===id));const result=walkingRoute(campusGraph,stops);assert.equal(result.missing,0,route.name);assert.equal(result.legs.length,stops.length-1);assert.ok(result.length>100&&result.length<5000);}
 console.log('Routing checks passed: road following, disconnected roads, directions, coordinate links and all seeded campus routes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
