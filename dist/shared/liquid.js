// One interaction layer for desktop pointers, touch and keyboard on both sites.
const controls='button,a.button,a.nav-item,.admin-nav nav a,#mobile-nav a,.auth-switch a,.leaflet-control a,label.file-button';
const groups=['.side-nav','.admin-nav nav','#mobile-nav','.auth-switch','.chips','.filter-tabs'];
const history=new Map(),motion=matchMedia('(prefers-reduced-motion: reduce)');
const reduceMotion=()=>document.documentElement.dataset.motion==='reduce'||motion.matches;
let queued=false,pressed=null,hovered=null,frame=0;
const enabled=e=>e&&!e.disabled&&!e.matches('.disabled,[aria-disabled="true"]');
const target=e=>e.target.closest?.(controls);
function prepare(element){
 if(element.classList.contains('liquid-control'))return;
 element.classList.add('liquid-control');
 // Photo tiles keep their existing gradients and photo composition.
 if(element.matches('.photo-wrap,.card-title,.map-teaser,.photo-upload'))element.classList.add('liquid-content-control');
 const optics=document.createElement('span');optics.className='liquid-optics';optics.setAttribute('aria-hidden','true');element.append(optics);
}
function position(element,event){
 const rect=element.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,event.clientX-rect.left)),y=Math.max(0,Math.min(rect.height,event.clientY-rect.top));
 element.style.setProperty('--glass-x',x+'px');element.style.setProperty('--glass-y',y+'px');
 if(!reduceMotion()){element.style.setProperty('--glass-dx',(rect.width?((x/rect.width-.5)*5):0)+'px');element.style.setProperty('--glass-dy',(rect.height?((y/rect.height-.5)*3):0)+'px');}
}
function wave(element){
 if(reduceMotion())return;const optics=element.querySelector(':scope > .liquid-optics');if(!optics)return;
 const bubble=document.createElement('span');bubble.className='liquid-wave';optics.append(bubble);
 const size=Math.max(element.offsetWidth,element.offsetHeight)*2.2;
 bubble.style.width=size+'px';bubble.style.height=size+'px';
 bubble.addEventListener('animationend',()=>bubble.remove(),{once:true});
}
function release(cancel=false){
 if(!pressed)return;const element=pressed;pressed=null;element.classList.remove('liquid-pressed');
 if(element.isConnected&&!reduceMotion()&&element.animate){
  element.animate([{scale:'1.055 .965'},{scale:'.985 1.025'},{scale:'1.018 .992'},{scale:'1 1'}],{duration:cancel?220:580,easing:'cubic-bezier(.2,.75,.25,1)'});
 }
 element.style.setProperty('--glass-dx','0px');element.style.setProperty('--glass-dy','0px');
}
function resetHover(){if(hovered){hovered.classList.remove('liquid-hover');hovered.style.setProperty('--glass-dx','0px');hovered.style.setProperty('--glass-dy','0px');hovered=null;}}
function updateGroups(){
 for(const selector of groups)document.querySelectorAll(selector).forEach((group,index)=>{
  if(!group.offsetWidth)return;const active=group.querySelector(':scope > .active');if(!active)return;
  if(!group.classList.contains('liquid-group'))group.classList.add('liquid-group');let lens=group.querySelector(':scope > .liquid-selection');
  if(!lens){lens=document.createElement('span');lens.className='liquid-selection';lens.setAttribute('aria-hidden','true');group.prepend(lens);}
  const r=active.getBoundingClientRect(),g=group.getBoundingClientRect();
  const next={left:r.left-g.left+group.scrollLeft,top:r.top-g.top+group.scrollTop,width:r.width,height:r.height};
  const key=selector+':'+index,old=history.get(key),different=!old||Object.keys(next).some(k=>Math.abs(old[k]-next[k])>.5);
  for(const [k,v]of Object.entries(next))lens.style[k]=v+'px';
  if(!different)return;history.set(key,next);
  if(old&&!reduceMotion()&&lens.animate){lens.animate([{left:old.left+'px',top:old.top+'px',width:old.width+'px',height:old.height+'px',borderRadius:'18px'},{left:next.left+'px',top:next.top+'px',width:next.width+'px',height:next.height+'px',borderRadius:'25px'}],{duration:480,easing:'cubic-bezier(.2,.85,.2,1.18)'});}
 });
}
function scan(){queued=false;document.querySelectorAll(controls).forEach(prepare);updateGroups();}
function schedule(){if(!queued){queued=true;requestAnimationFrame(scan);}}
document.addEventListener('pointerover',e=>{const element=target(e);if(!enabled(element)||e.pointerType==='touch')return;resetHover();prepare(element);hovered=element;element.classList.add('liquid-hover');position(element,e);});
document.addEventListener('pointermove',e=>{const element=pressed||hovered;if(!enabled(element))return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>position(element,e));},{passive:true});
document.addEventListener('pointerout',e=>{if(hovered&&!hovered.contains(e.relatedTarget))resetHover();});
document.addEventListener('pointerdown',e=>{const element=target(e);if(e.button!==0||!enabled(element))return;prepare(element);release(true);pressed=element;position(element,e);element.classList.add('liquid-pressed');wave(element);},{passive:true});
document.addEventListener('pointerup',()=>release());document.addEventListener('pointercancel',()=>{release(true);resetHover();});
document.addEventListener('keydown',e=>{if(e.repeat||!['Enter',' '].includes(e.key))return;const element=target(e);if(!enabled(element)||(e.key===' '&&element.tagName==='A'))return;prepare(element);pressed=element;element.style.setProperty('--glass-x','50%');element.style.setProperty('--glass-y','50%');element.classList.add('liquid-pressed');wave(element);});
document.addEventListener('keyup',()=>release());
document.addEventListener('click',e=>{const element=target(e);if(enabled(element)&&e.detail===0&&!pressed){prepare(element);wave(element);}schedule();});
window.addEventListener('blur',()=>{release(true);resetHover();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){release(true);resetHover();}});
window.addEventListener('resize',schedule);document.fonts?.ready.then(schedule);motion.addEventListener('change',()=>{release(true);resetHover();});
new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||[...r.addedNodes].some(n=>n.nodeType===1&&!n.matches('.liquid-optics,.liquid-selection,.liquid-wave'))))schedule();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
schedule();
