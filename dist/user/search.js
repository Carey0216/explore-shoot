import {$,esc,icon} from '/shared/ui.js';

export const cleanQuery=value=>String(value??'').trim().slice(0,100);
export function matchingPoints(points,query){
 const q=cleanQuery(query).normalize('NFKC').toLocaleLowerCase();
 return points.filter(p=>!q||[p.name,p.description,p.theme].join(' ').normalize('NFKC').toLocaleLowerCase().includes(q));
}
export function searchHTML(query){
 return `<section class="search-page" aria-labelledby="search-title"><a href="#discover" class="button secondary search-back">← 返回发现</a><header class="search-heading"><span class="eyebrow">北方民族大学 · 校园搜索</span><h1 id="search-title">找个地方，<em>去看看。</em></h1><p>一栋建筑，一处树影，或一个想去的角落。</p></header><form id="campus-search-form" class="campus-search-form" role="search"><div class="campus-search-field">${icon('search')}<input id="campus-search-input" name="q" type="search" aria-label="搜索校园点位" placeholder="搜索点位名称、主题或描述" maxlength="100" enterkeyhint="search" autocomplete="off" value="${esc(query)}"><button id="search-clear" class="icon-btn" type="button" aria-label="清除搜索关键词" ${query?'':'hidden'}>${icon('close')}</button></div><button class="button search-submit" type="submit">搜索</button></form><div class="search-suggestions" aria-label="快捷搜索"><span>试试搜索</span>${['图书馆','建筑','自然','运动'].map(q=>`<button class="button secondary" type="button" data-search-term="${q}">${q}<span aria-hidden="true">↗</span></button>`).join('')}</div><p id="search-result-status" class="search-result-status" role="status" aria-live="polite"></p><div id="search-results" aria-live="off"></div></section>`;
}
export function bindSearch({query,setQuery,points,card,bindCards,focus=false}){
 const input=$('#campus-search-input'),clear=$('#search-clear'),form=$('#campus-search-form');
 if(input.value!==query)input.value=query;
 const update=()=>{
  const q=cleanQuery(input.value);setQuery(q);clear.hidden=!input.value;
  const found=q?matchingPoints(points,q):points.filter(p=>p.open).slice(0,4);
  $('#search-result-status').textContent=q?`「${q}」 · 找到 ${found.length} 个校园点位`:'不知道从哪儿开始？先看看这些校园角落。';
  $('#search-results').innerHTML=found.length?`<div class="feed-grid search-grid">${found.map(card).join('')}</div>`:`<div class="search-empty">${icon('search')}<h2>暂时没有找到这个地方</h2><p>换一个名称或主题试试，也可以清除关键词重新发现。</p><button id="search-reset" class="button secondary" type="button">重新搜索</button></div>`;
  bindCards($('#search-results'));
  $('#search-reset')?.addEventListener('click',()=>{input.value='';update();input.focus();});
 };
 input.oninput=update;
 form.onsubmit=e=>{e.preventDefault();update();input.blur();};
 clear.onclick=()=>{input.value='';update();input.focus();};
 document.querySelectorAll('[data-search-term]').forEach(b=>b.onclick=()=>{input.value=b.dataset.searchTerm;update();input.blur();});
 update();if(focus)input.focus({preventScroll:true});
}
