import {$,esc,api} from './ui.js';
export const voiceHTML=()=>`<details class="voice-panel"><summary><span>选择导航声音</span><small id="voice-current">暖禾 · 女声</small></summary><p class="voice-note" id="voice-note" role="status">正在准备免费本机音色…</p><div class="voice-grid" id="voice-grid" role="radiogroup" aria-label="导航音色"></div><button class="button secondary wide" id="voice-preview">试听这段旅程</button><p class="voice-status" id="voice-status" role="status"></p></details>`;
export const navigationPrompts=Object.freeze({start:'导航已开始，请沿路线出发。',left:'前方左转，请注意脚下。',right:'前方右转，请注意脚下。',arrival:'你已到达目的地附近，请确认现场入口。',straight:'请沿当前道路继续前进。',enabled:'语音提示已开启，我们一起出发。'});
export async function mountVoice({onError=()=>{},onChange=()=>{}}={}){
 let chosen='he',enabled=false,destroyed=false,generation=0,url=null,voices=[],available=false;
 try{chosen=localStorage.getItem('explore-navigation-voice')||chosen;}catch{}
 const audio=new Audio();audio.preload='auto';
 const prepared=new Map(),loading=new Map();let cacheEpoch=0,cacheBytes=0;
 function clearPrepared(){cacheEpoch++;for(const job of loading.values())job.controller.abort();loading.clear();prepared.clear();cacheBytes=0;}
 async function loadClip(text,{prefetch=false}={}){
  text=text.slice(0,120);const key=chosen+':'+text;
  if(prepared.has(key)){const clip=prepared.get(key);prepared.delete(key);prepared.set(key,clip);return clip;}
  if(loading.has(key))return loading.get(key).promise;
  if(prefetch&&loading.size>=2)return null;
  const abort=new AbortController(),epoch=cacheEpoch,voice=chosen;
  const promise=(async()=>{const res=await fetch('/api/navigation/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice,text,prefetch}),signal:abort.signal});if(!res.ok){let body;try{body=await res.json();}catch{}throw Error(body?.error||'语音暂不可用，请稍后再试');}const blob=await res.blob();if(destroyed||epoch!==cacheEpoch||voice!==chosen)return null;prepared.set(key,blob);cacheBytes+=blob.size;while(prepared.size>12||cacheBytes>4*1024*1024){const first=prepared.keys().next().value;cacheBytes-=prepared.get(first).size;prepared.delete(first);}return blob;})();
  loading.set(key,{promise,controller:abort});try{return await promise;}finally{if(loading.get(key)?.promise===promise)loading.delete(key);}
 }
 // Preparation never touches Audio.play() or asks for location permission.
 function prepare(text){if(destroyed||!available||!text)return Promise.resolve(false);return loadClip(text,{prefetch:true}).then(Boolean,()=>false);}
 const note=$('#voice-note'),grid=$('#voice-grid'),preview=$('#voice-preview'),status=$('#voice-status'),current=$('#voice-current');
 function stop(){generation++;clearPrepared();audio.pause();audio.removeAttribute('src');audio.load();if(url){URL.revokeObjectURL(url);url=null;}preview.disabled=!available;preview.textContent='试听这段旅程';status.classList.remove('playing');}
 function selected(){return voices.find(v=>v.id===chosen)||voices[0];}
 function render(){const v=selected();current.textContent=v?v.name+' · '+v.gender:'本机音色未就绪';grid.innerHTML=voices.map(v=>`<button type="button" class="voice-choice ${v.id===chosen?'selected':''}" role="radio" aria-checked="${v.id===chosen}" data-voice="${esc(v.id)}" ${available?'':'disabled'}><span class="voice-avatar ${v.gender==='男声'?'male':''}" aria-hidden="true">${esc(v.name[0])}</span><span><strong>${esc(v.name)}</strong><small>${esc(v.gender)} · 普通话</small></span><i aria-hidden="true">${v.id===chosen?'✓':'○'}</i></button>`).join('');preview.disabled=!available;}
 function choose(id){stop();chosen=id;try{localStorage.setItem('explore-navigation-voice',chosen);}catch{}render();grid.querySelector?.('[data-voice="'+chosen+'"]')?.focus();status.textContent='已选择 '+selected().name+'，点击试听听听看。';onChange();}
 grid.onclick=e=>{const b=e.target.closest('[data-voice]');if(!b||!available)return;choose(b.dataset.voice);};
 grid.onkeydown=e=>{if(!available||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();let index=voices.findIndex(v=>v.id===chosen);index=e.key==='Home'?0:e.key==='End'?voices.length-1:(index+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+voices.length)%voices.length;choose(voices[index].id);};
 async function speak(text,{sample=false}={}){
  if(destroyed||(!enabled&&!sample)||!available)return false;
  // Replace playback without discarding the next prepared clip; explicit stop still aborts everything.
  generation++;const id=generation;audio.pause();if(url){URL.revokeObjectURL(url);url=null;}status.classList.remove('playing');status.textContent=sample?'正在准备声音，新句子可能稍慢…':'正在准备导航提示…';if(sample){preview.disabled=true;preview.textContent='声音准备中…';}
  try{const blob=await loadClip(text);if(!blob||destroyed||id!==generation)return false;url=URL.createObjectURL(blob);audio.src=url;await audio.play();if(destroyed||id!==generation)return false;status.textContent=sample?'正在试听 '+selected().name:'正在播报 '+selected().name;status.classList.add('playing');preview.disabled=false;preview.textContent='重新试听';return true;}
  catch(e){if(destroyed||id!==generation||e.name==='AbortError')return false;status.textContent=e.name==='NotAllowedError'?'浏览器阻止了播放，请点击试听后再开启语音。':e.message;preview.disabled=false;preview.textContent='重新试听';onError(status.textContent);return false;}
 }
 audio.onended=()=>{status.classList.remove('playing');status.textContent='播报结束 · '+(selected()?.name||'');preview.textContent='再次试听';};
 // Unlock this same element during a user gesture for mobile browsers. Playback errors stay visible.
 function unlock(){audio.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';audio.play().catch(()=>{});}
 preview.onclick=()=>{unlock();speak('你好，我是'+selected().name+'。我们一起探索校园。前方沿道路步行一百米，然后左转。',{sample:true});};
 try{const result=await api('/api/navigation/voices');if(destroyed)return {destroy(){}};voices=result.voices||[];available=result.available===true;if(!voices.some(v=>v.id===chosen))chosen=voices[0]?.id||'he';note.textContent=result.note;render();}
 catch{note.textContent='无法连接本机语音服务，请刷新重试。';preview.disabled=true;}
 return {get enabled(){return enabled;},toggle(){if(!available){onError('本机语音未安装，请联系管理员准备音色。');return false;}enabled=!enabled;stop();if(enabled){unlock();speak(navigationPrompts.enabled);}status.textContent=enabled?'导航时会为你播报路线提示':'语音提示已关闭';return enabled;},speak,prepare,stop,destroy(){destroyed=true;enabled=false;stop();audio.onended=null;grid.onclick=null;grid.onkeydown=null;preview.onclick=null;}};
}
