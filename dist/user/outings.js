import {icon} from '/shared/ui.js';
export const outingPages=['map','navigate','routes','active'];
export const mobileItems=[['discover','discover','发现'],['shots','camera','机位'],['map','walk','出行'],['me','user','我的']];
export function navSelected(item,page){return item==='discover'?['discover','search'].includes(page):item==='shots'?['shots','place','checkin'].includes(page):item==='map'?outingPages.includes(page):item==='me'?['me','settings','passport','notes'].includes(page):item===page;}
export function outingTabs(page){return outingPages.includes(page)?`<nav class="outing-tabs chips" aria-label="出行方式">${[['map','map','地图'],['navigate','pin','导航'],['routes','walk','探索']].map(([id,image,name])=>`<a href="#${id}" class="chip ${page===id||id==='routes'&&page==='active'?'active':''}" ${page===id||id==='routes'&&page==='active'?'aria-current="page"':''}>${icon(image)}${name}</a>`).join('')}</nav>`:'';}
