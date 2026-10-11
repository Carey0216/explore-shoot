import {api} from '/shared/ui.js';
let sessionId;
function visitor(){if(sessionId)return sessionId;try{sessionId=sessionStorage.getItem('explore-view-session');if(!/^[a-f0-9-]{36}$/.test(sessionId||'')){sessionId=crypto.randomUUID();sessionStorage.setItem('explore-view-session',sessionId);}}catch{sessionId=crypto.randomUUID();}return sessionId;}
export async function recordPointView(point){try{const stats=await api('/api/points/'+encodeURIComponent(point.id)+'/view','POST',{clientId:visitor()});Object.assign(point,stats);}catch{/* Browsing remains available when the counter is offline. */}}
