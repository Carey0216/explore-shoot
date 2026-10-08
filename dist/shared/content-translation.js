import {originalText,originalAttribute,knownContentTranslation} from './i18n.js';
const excluded='script,style,svg,canvas,.community-translation,.page-translation,#startup,.provider-map-surface,.tencent-map-surface,.leaflet-pane,.leaflet-control-attribution';
const attributes=['aria-label','title','alt','placeholder'];
export function collectText(roots,previous=new Map()){
 const entries=[];
 function add(node,name){const value=name?node.getAttribute(name):node.data;if(!value?.trim()||!/[\p{L}]/u.test(value))return;const key=name?name:'text',old=previous.get(node)?.get(key);if(old&&old.output===value){entries.push(old);return;}entries.push({node,name,key,before:value,source:name?originalAttribute(node,name):originalText(node),output:null});}
 function visit(node){if(node.nodeType===3){if(!node.parentElement?.closest(excluded+',textarea'))add(node,null);return;}if(node.nodeType!==1||node.closest(excluded))return;if(node.tagName==='OPTION'&&!node.hasAttribute('value'))node.setAttribute('value',node.textContent.trim());for(const name of attributes)add(node,name);if(['TEXTAREA','INPUT'].includes(node.tagName))return;for(const child of node.childNodes)visit(child);}
 for(const root of roots)if(root)visit(root);
 document.dispatchEvent(new CustomEvent('content-translation:collect',{detail:{roots,entries,previous}}));return entries;
}
export const knownTranslation=(text,target)=>knownContentTranslation(text,target);
export function replaceText(entry,value){const current=entry.get?entry.get():entry.name?entry.node.getAttribute(entry.name):entry.node.data;if(current!==(entry.output??entry.before))return false;if(entry.set){entry.set(value);entry.output=value;return true;}const parent=entry.name?entry.node:entry.node.parentElement;if(!parent)return false;parent.setAttribute('data-content-translated','');if(entry.name)entry.node.setAttribute(entry.name,value);else entry.node.data=value;entry.output=value;return true;}
export function restoreText(entries){
 for(const entry of entries){const current=entry.get?entry.get():entry.name?entry.node.getAttribute(entry.name):entry.node.data;if(entry.output!==null&&current===entry.output){if(entry.set)entry.set(entry.before);else if(entry.name)entry.node.setAttribute(entry.name,entry.before);else entry.node.data=entry.before;}}
 for(const entry of entries){if(entry.set)continue;const parent=entry.name?entry.node:entry.node.parentElement;parent?.removeAttribute('data-content-translated');}
}
