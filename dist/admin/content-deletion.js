import {$,esc,api,modal,closeModal,formSubmit,field,errorHTML,toast} from '/shared/ui.js';
const names={points:'点位',routes:'路线',templates:'拍摄任务模板'};
const bytes=n=>n>=1048576?(n/1048576).toFixed(2)+' MB':(n/1024).toFixed(1)+' KB';
export async function deleteContent(type,item,refresh){
 const status=await api('/api/admin/content-deletion/verification');
 let remembered=!!status.verifiedUntil&&status.verifiedUntil>Date.now();
 const name=item.name||item.title;
 modal('删除'+names[type]+' · 第 1 / 2 步',`<div class="deletion-warning"><strong>这次操作会永久删除内容</strong><p>你正在删除「${esc(name)}」。请先验证当前管理员身份，下一步会列出删除范围并再次确认。</p></div><form id="deletion-verify-form"><div id="delete-password-field">${field('当前管理员密码','password','password','','required maxlength="128" autocomplete="current-password"')}</div><label class="deletion-check"><input type="checkbox" name="remember" ${remembered?'checked':''}><span>15 分钟内无需再次输入密码<small>仅当前登录会话有效，每次删除仍需二次确认。</small></span></label><p id="delete-verification-state" class="tip" aria-live="polite"></p>${errorHTML}<div class="deletion-actions"><button type="button" class="button secondary" id="delete-cancel">取消</button><button type="submit" class="button">验证并查看删除范围</button></div></form>`,d=>{
  const checkbox=$('[name=remember]',d),input=$('[name=password]',d);
  const update=()=>{const reuse=remembered&&checkbox.checked;$('#delete-password-field',d).hidden=reuse;input.disabled=reuse;input.required=!reuse;$('#delete-verification-state',d).textContent=reuse?'已验证，免重复验证将在 '+new Date(status.verifiedUntil).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' 到期。':'不会保存或上传到日志中的密码。';if(!reuse)input.focus();};
  checkbox.onchange=update;update();$('#delete-cancel',d).onclick=closeModal;
  $('#deletion-verify-form',d).onsubmit=e=>formSubmit(e,async f=>{
   try{
    const prepared=await api('/api/admin/content-deletion/prepare','POST',{type,id:item.id,password:f.password,remember:checkbox.checked});
    if(d.isConnected)confirmation(prepared,refresh);
   }catch(e){if(e.status===403&&input.disabled){remembered=false;update();}throw e;}
  });
 });
}
function confirmation(prepared,refresh){
 const p=prepared.preview;
 const scope=p.type==='points'?`<li>删除点位资料及 ${p.relatedTemplates} 个关联模板、${p.relatedReports} 条关联反馈。</li><li>从 ${p.affectedRoutes} 条关联路线中移除该点位，并将这些路线停用，等待重新检查。</li><li>删除 ${p.deletedPhotos} 张独占照片，约释放 ${bytes(p.photoBytes)}；保留 ${p.preservedPhotos} 张仍被其他内容或探索记录使用的照片。</li>`:`<li>从服务器永久移除这${p.type==='routes'?'条路线及其实走校准资料':'个拍摄任务模板'}。</li>`;
 modal('最后确认 · 第 2 / 2 步',`<div class="deletion-warning critical"><span class="deletion-eyebrow">PERMANENT DELETE</span><h3>永久删除「${esc(p.name)}」？</h3><p>删除后无法通过后台撤销，重新上线也不能恢复。</p></div><ul class="deletion-scope">${scope}<li>保留用户已有的私人探索记录，以及本次操作的审计记录。</li></ul><form id="deletion-final-form"><label class="deletion-check"><input type="checkbox" name="confirmed" required><span>我已了解删除范围，确认执行不可逆删除。</span></label>${errorHTML}<div class="deletion-actions"><button type="button" class="button secondary" id="delete-back">取消删除</button><button type="submit" class="button danger">永久删除</button></div><p class="tip">本次确认 5 分钟内有效。内容状态或照片引用发生变化时，需要重新确认。</p></form>`,d=>{
  let busy=false;
  const cancel=$('#delete-back',d),close=$('.dialog-head button',d);
  // Avoid hiding an in-flight destructive request and suggesting it was cancelled.
  d.addEventListener('cancel',e=>{if(busy){e.preventDefault();e.stopImmediatePropagation();}},true);
  d.addEventListener('click',e=>{if(busy&&(e.target===d||e.target.closest('.dialog-head button'))){e.preventDefault();e.stopImmediatePropagation();}},true);
  cancel.onclick=closeModal;
  $('#deletion-final-form',d).onsubmit=e=>formSubmit(e,async f=>{
   if(f.confirmed!=='on')throw Error('请先确认不可逆删除。');
   busy=true;cancel.disabled=true;close.disabled=true;
   try{
    const result=await api('/api/admin/content-deletion/commit','POST',{confirmationToken:prepared.confirmationToken,confirmed:true});
    closeModal();
    try{await refresh();}catch{toast('内容已删除，列表刷新失败，请手动刷新。');}
    modal('删除已完成',`<p>「${esc(p.name)}」已从服务器内容库移除。</p><p class="notice">${result.cleanupPending?'有 '+result.cleanupPending+' 个照片文件暂未清理，服务器会自动重试；可在操作记录查看进度。':'独占照片文件已清理；仍被引用的照片已保留。'}</p><p class="tip">操作者、操作时间、来源 IP 和删除范围已记录在「操作记录」中。</p><button id="delete-done" class="button wide">完成</button>`,d=>{$('#delete-done',d).onclick=closeModal;});
   }finally{busy=false;cancel.disabled=false;close.disabled=false;}
  });
 });
}
