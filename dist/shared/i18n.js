import {messages,manualMessages} from './messages.js';
import {getPreferences,subscribePreferences} from './preferences.js';
const languages=['zh-CN','zh-TW','ja','en'];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=[...messages].filter(([source])=>source.includes('{')&&!/^(?:查看|收藏|取消收藏|步行前往|清除)\{v\d+\}$/.test(source)).sort(([a],[b])=>Number(manualMessages.has(b))-Number(manualMessages.has(a))||b.replace(/\{\w+\}/g,'').length-a.replace(/\{\w+\}/g,'').length).map(([source,targets])=>{const keys=[];const expression=source.split(/(\{\w+\})/).map(part=>{if(!part.startsWith('{'))return escape(part);const key=part.slice(1,-1);keys.push(key);return ['n','total','done','photos','minutes','walk','stay','buffer','count'].includes(key)?'([\\d.,]+)':'(.+?)';}).join('');return {source,regex:new RegExp('^'+expression+'$'),keys,targets};});
export function translate(value,language=getPreferences().language){
 const source=String(value??''),index=languages.indexOf(language)-1;if(index<0)return source;
 const space=source.match(/^(\s*)([\s\S]*?)(\s*)$/),s=space[2];
 for(const table of [manualMessages,messages]){
  const exact=table.get(s);if(exact)return space[1]+exact[index]+space[3];
  for(const pattern of patterns){if(table===manualMessages&&!manualMessages.has(pattern.source))continue;const match=s.match(pattern.regex);if(!match)continue;const values=Object.fromEntries(pattern.keys.map((key,i)=>[key,['noun','distance'].includes(key)?translate(match[i+1],language):match[i+1]]));return space[1]+pattern.targets[index].replace(/\{(\w+)\}/g,(_,key)=>values[key])+space[3];}
 }
 if(s.includes(' · '))return space[1]+s.split(' · ').map(part=>translate(part,language)).join(' · ')+space[3];
 for(const [prefix,targets] of [['清除',['清除','クリア：','Clear ']],['步行前往',['步行前往','徒歩で行く：','Walk to ']],['取消收藏',['取消收藏','保存を解除：','Unsave ']],['收藏',['收藏','保存：','Save ']],['查看',['查看','見る：','View ']]])if(s.startsWith(prefix)&&s.length>prefix.length)return space[1]+targets[index]+translate(s.slice(prefix.length),language)+space[3];
 return source;
}
const excluded='script,style,svg,canvas,textarea,[data-i18n-skip],.card-title,.card-description,.detail-description,.detail-source,.route-path,.route-card h2,.route-stops span,.account-avatar>span,.profile h2,.record h3,.map-item strong,.map-app-destination,.journey-steps li,[data-destination],#map-selected-name,#map-selected-body>p,.map-condition p,.task-top h3,.task-card h4,.task-card ol,#nav-name,#nav-reading,#journey-instruction,.active-top h2,#journey-from option:not([value=""]):not([value="gps"]):not([value="pick"]),#journey-to option:not([value=""])';
const sdkMaps='.provider-map-surface,.tencent-map-surface,.leaflet-pane,.leaflet-control-attribution';
const texts=new WeakMap(),attributes=new WeakMap();let observer,language=getPreferences().language;
function text(node){let entry=texts.get(node);if(!entry||node.data!==entry.output)entry={source:node.data};const output=translate(entry.source,language);entry.output=output;texts.set(node,entry);if(node.data!==output)node.data=output;}
function visit(node){if(!node)return;if(node.nodeType===3){if(!node.parentElement?.closest(excluded+','+sdkMaps))text(node);return;}if(node.nodeType!==1||node.closest(excluded+','+sdkMaps))return;
 if(node.tagName==='OPTION'&&!node.hasAttribute('value'))node.setAttribute('value',node.textContent.trim());
 let cache=attributes.get(node);if(!cache){cache=new Map();attributes.set(node,cache);}for(const name of ['placeholder','aria-label','title','alt']){const value=node.getAttribute(name);if(value===null)continue;let entry=cache.get(name);if(!entry||value!==entry.output)entry={source:value};entry.output=translate(entry.source,language);cache.set(name,entry);if(value!==entry.output)node.setAttribute(name,entry.output);}
 for(const child of [...node.childNodes])visit(child);
}
const options={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']};
function batch(nodes){observer?.disconnect();for(const node of nodes)visit(node);observer?.observe(document.body,options);}
export function startI18n(){if(observer)return;observer=new MutationObserver(records=>{const nodes=new Set();for(const record of records){if(record.type==='childList')record.addedNodes.forEach(n=>nodes.add(n));else nodes.add(record.target);}batch(nodes);});const apply=()=>{const pref=getPreferences();language=pref.language;document.documentElement.lang=language;document.documentElement.dataset.textSize=pref.textSize;document.documentElement.dataset.motion=pref.motion;if(document.getElementById('startup'))window.campusStartup?.configure(pref);batch([document.body,document.querySelector('title')]);};subscribePreferences(apply);apply();}
