export function visits(checkins=[],sessions=[]) {
 const records=checkins.map(c=>({...c,kind:'checkin'}));
 for(const s of sessions)for(const t of s.tasks||[])if(t.status==='done')records.push({id:s.id+':'+t.id,pointId:t.pointId,pointName:t.pointName,shotTitle:t.title,note:s.feedback||'',mediaId:t.mediaId,createdAt:t.completedAt||s.endedAt||s.createdAt,legacyTime:!t.completedAt,kind:'task',sessionId:s.id});
 return records.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
export function passport(records,points) {
 const ids=new Set(records.map(c=>c.pointId)),current=points.filter(p=>ids.has(p.id));
 return {visits:records.length,unique:ids.size,current:current.length,total:points.length,photos:records.filter(c=>c.mediaId).length,ids};
}
export function distance(a,b){const r=Math.PI/180;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2)));}
export function selectPlaces(points,templates,{query='',filter='all',location=null,visited=new Set(),bookmarks=[],match=(text,q)=>text.toLocaleLowerCase().includes(q)}={}) {
 const q=query.trim().toLocaleLowerCase();
 return points.filter(p=>(filter!=='saved'||bookmarks.includes(p.id))&&(filter!=='visited'||visited.has(p.id))&&(filter!=='unvisited'||!visited.has(p.id))&&(!q||match([p.name,p.description,p.theme,...templates.filter(t=>t.pointId===p.id&&t.approved).map(t=>t.title)].join(' '),q))).sort((a,b)=>filter==='nearby'&&location?distance(location,a)-distance(location,b):0);
}
