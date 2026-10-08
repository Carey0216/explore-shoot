import {esc} from './ui.js';
import {getPreferences,subscribePreferences} from './preferences.js';
import {collectText,knownTranslation,replaceText,restoreText} from './content-translation.js';
const languages=[['zh-CN','简体中文'],['zh-TW','繁體中文'],['ja','日本語'],['en','English']];
const cache=new Map(),states=new Map();let started=false,generation=0,observer,timer;
const targetLanguage=()=>getPreferences().language==='zh-CN'?'en':getPreferences().language;
const selectHTML=()=>`<select aria-label="译文语言" data-translation-language>${languages.map(([id,name])=>`<option data-i18n-skip value="${id}" ${targetLanguage()===id?'selected':''}>${name}</option>`).join('')}</select>`;
export function translationHTML(point){if(!point?.id)return '';return `<section class="community-translation" data-translation-point="${esc(point.id)}"><div class="translation-tools"><button type="button" class="text-btn translation-toggle" data-translate aria-pressed="false">翻译全文</button>${selectHTML()}</div><p class="translation-status" role="status"></p></section>`;}
function ensureControl(){const header=document.querySelector('#topbar .header-right');if(!header||header.querySelector('.page-translation'))return;const control=document.createElement('details');control.className='page-translation';control.innerHTML=`<summary class="button secondary small" aria-label="翻译此页"><span aria-hidden="true">文 / A</span></summary><div class="page-translation-panel glass-surface"><b>翻译此页</b><p>名称、介绍、地址、手记及导航文字都可翻译。</p><div class="translation-tools">${selectHTML()}<button type="button" class="button secondary small" data-translate aria-pressed="false">翻译此页</button></div><p class="translation-status" role="status"></p><small>译文替换当前显示，随时可查看原文。仅本页临时保存。</small></div>`;header.prepend(control);}
function setStatus(box,text){box.querySelector('.translation-status').textContent=text;}
function reset(box){const state=states.get(box);if(state){state.controller?.abort();restoreText([...state.entries.values()].flatMap(m=>[...m.values()]));states.delete(box);}const button=box.querySelector('[data-translate]');if(button){button.disabled=false;button.textContent=box.matches('.page-translation')?'翻译此页':'翻译全文';button.setAttribute('aria-pressed','false');}setStatus(box,'');}
export function clearTranslations(){generation++;clearTimeout(timer);for(const box of [...states.keys()])reset(box);cache.clear();}
function rootsFor(box){return box.matches('.page-translation')?[...document.querySelectorAll('#sidebar,#topbar,#main,#mobile-nav,.app-shell>footer,#dialog')]:[box.closest('.point-card,#dialog,#map-point-info')||box.parentElement];}
function connected(entry){return entry.node.isConnected;}
async function update(box,state){
 if(!box.isConnected||state.controller.signal.aborted||states.get(box)!==state)return;
 if(state.busy){state.dirty=true;return;}state.busy=true;const button=box.querySelector('[data-translate]'),stamp=generation;button.disabled=true;
 try{
  const entries=collectText(rootsFor(box),state.entries).filter(connected),pending=new Map();
  state.entries=new Map();for(const entry of entries){if(!state.entries.has(entry.node))state.entries.set(entry.node,new Map());state.entries.get(entry.node).set(entry.key,entry);}
  for(const entry of entries){if(entry.output!==null)continue;const key=JSON.stringify([entry.source,state.target]);let value=cache.get(key)??knownTranslation(entry.source,state.target);if(value!==null&&value!==undefined)replaceText(entry,value);else {if(entry.source.length>4000)throw Error('这段文字过长，请分段查看');if(!pending.has(entry.source))pending.set(entry.source,[]);pending.get(entry.source).push(entry);}}
  const sources=[...pending.keys()];let done=0;
  while(done<sources.length){const batch=[];let length=0;while(done+batch.length<sources.length&&batch.length<40){const text=sources[done+batch.length];if(batch.length&&length+text.length>8000)break;batch.push(text);length+=text.length;}
   setStatus(box,`正在翻译 ${done} / ${sources.length} 段文字…`);
   const response=await fetch('/api/translation',{method:'POST',credentials:'same-origin',cache:'no-store',signal:state.controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:batch,target:state.target})});const data=await response.json();if(!response.ok)throw Error(data.error||'翻译暂不可用，请重试');if(!Array.isArray(data.texts)||data.texts.length!==batch.length||data.texts.some(t=>typeof t!=='string'))throw Error('翻译结果无效，请重试');
   if(stamp!==generation||state.controller.signal.aborted||states.get(box)!==state||!box.isConnected)return;
   batch.forEach((source,i)=>{cache.set(JSON.stringify([source,state.target]),data.texts[i]);while(cache.size>2000)cache.delete(cache.keys().next().value);for(const entry of pending.get(source))if(connected(entry))replaceText(entry,data.texts[i]);});done+=batch.length;
  }
  if(states.get(box)===state&&box.isConnected){button.textContent='查看原文';button.setAttribute('aria-pressed','true');setStatus(box,'机器翻译 · 仅当前页面有效');state.active=true;}
 }catch(error){if(error.name!=='AbortError'&&states.get(box)===state&&box.isConnected){reset(box);setStatus(box,error.message||'翻译失败，请重试');}}
 finally{state.busy=false;if(states.get(box)===state){button.disabled=false;if(state.dirty){state.dirty=false;queueMicrotask(()=>update(box,state));}}}
}
export function startCommunityTranslation(){if(started)return;started=true;
 window.addEventListener('pagehide',clearTranslations);window.addEventListener('hashchange',clearTranslations);window.addEventListener('pageshow',e=>{if(e.persisted)clearTranslations();});subscribePreferences(clearTranslations);
 document.addEventListener('click',async e=>{const button=e.target.closest('[data-translate]');if(!button){for(const box of document.querySelectorAll('.page-translation[open]'))if(!box.contains(e.target))box.open=false;return;}const box=button.closest('.community-translation,.page-translation');if(!box)return;if(states.get(box)?.active){reset(box);return;}
  // Overlapping translations share one owner; never translate an existing translation again.
  const roots=rootsFor(box);for(const [other] of states)if(roots.some(root=>rootsFor(other).some(r=>root?.contains(r)||r?.contains(root))))reset(other);
  const state={entries:new Map(),target:box.querySelector('[data-translation-language]').value,controller:new AbortController(),active:false,busy:false,dirty:false};states.set(box,state);await update(box,state);
 });
 document.addEventListener('change',e=>{if(e.target.matches('[data-translation-language]'))reset(e.target.closest('.community-translation,.page-translation'));});
 observer=new MutationObserver(records=>{ensureControl();let changed=false;for(const [box,state] of states){if(!box.isConnected){reset(box);continue;}const roots=rootsFor(box);if(records.some(r=>!r.target.parentElement?.closest('.community-translation,.page-translation')&&!r.target.closest?.('.community-translation,.page-translation')&&roots.some(root=>root?.contains(r.target))))changed=true;}
  if(changed){clearTimeout(timer);timer=setTimeout(()=>{for(const [box,state] of states)if(box.isConnected)update(box,state);},200);}
 });observer.observe(document.body,{subtree:true,childList:true,characterData:true});ensureControl();
}
