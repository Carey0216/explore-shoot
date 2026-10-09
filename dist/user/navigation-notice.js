// A navigation interruption must remain visible even after the full-screen map exits.
export function navigationNoticeHTML(){return `<aside id="navigation-notice" class="navigation-notice" role="alert" aria-atomic="true" hidden><span class="navigation-notice-icon" aria-hidden="true">!</span><p></p><button type="button" aria-label="关闭导航提醒">×</button></aside>`;}

export function mountNavigationNotice(element,{duration=9000}={}){
 let timer=null,pending='',destroyed=false;
 const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
 function clear(){clearTimer();pending='';element.hidden=true;}
 function show(reason){if(destroyed)return;clearTimer();pending=reason;element.querySelector('p').textContent=reason;
  // Do not spend the reading time while the browser is in the background.
  element.hidden=document.hidden;
  if(!document.hidden)timer=setTimeout(clear,duration);
 }
 const visibility=()=>{if(!pending)return;if(document.hidden){clearTimer();element.hidden=true;}else show(pending);};
 const close=element.querySelector('button');close.onclick=clear;
 document.addEventListener('visibilitychange',visibility);
 return {show,clear,destroy(){if(destroyed)return;clear();destroyed=true;close.onclick=null;document.removeEventListener('visibilitychange',visibility);}};
}
