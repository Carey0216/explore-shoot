import {$,esc,icon} from '/shared/ui.js';

export const cleanQuery=value=>String(value??'').trim().slice(0,100);
const aliases={library:'图书馆','図書館':'图书馆','圖書館':'图书馆',architecture:'建筑',building:'建筑','建築':'建筑','建物':'建筑',nature:'自然',sport:'运动',sports:'运动','スポーツ':'运动','運動':'运动',life:'人文'};
const normalizedQuery=value=>{const q=cleanQuery(value).normalize('NFKC').toLocaleLowerCase();return aliases[q]||q;};
export const matchesText=(text,query)=>String(text).normalize('NFKC').toLocaleLowerCase().includes(normalizedQuery(query));
export function matchingPoints(points,query){
 const q=normalizedQuery(query);
 return points.filter(p=>!q||[p.name,p.description,p.theme].join(' ').normalize('NFKC').toLocaleLowerCase().includes(q));
}
export function searchHTML(query){
 return `<section class="search-page" aria-labelledby="search-title"><a href="#discover" class="button secondary search-back">← 返回发现</a><header class="search-heading"><h1 id="search-title">搜索校园点位</h1></header><form id="campus-search-form" class="campus-search-form" role="search"><div class="campus-search-field">${icon('search')}<input id="campus-search-input" name="q" type="search" aria-label="搜索校园点位" placeholder="搜索点位名称、主题或描述" maxlength="100" enterkeyhint="search" autocomplete="off" value="${esc(query)}"><button id="search-clear" class="icon-btn" type="button" aria-label="清除搜索关键词" ${query?'':'hidden'}>${icon('close')}</button></div><button class="button search-submit" type="submit">搜索</button></form><div class="search-suggestions" aria-label="快捷搜索"><span>试试搜索</span>${['图书馆','建筑','自然','运动'].map(q=>`<button class="button secondary" type="button" data-search-term="${q}">${q}<span aria-hidden="true">↗</span></button>`).join('')}</div><p id="search-result-status" class="search-result-status" role="status" aria-live="polite"></p><div id="search-results" aria-live="off"></div></section>`;
}
export function bindSearch({query,setQuery,points,card,bindCards,focus=false}){
 const input=$('#campus-search-input'),clear=$('#search-clear'),form=$('#campus-search-form');
 if(input.value!==query)input.value=query;
 const update=()=>{
  const q=cleanQuery(input.value);setQuery(q);clear.hidden=!input.value;
  const found=q?matchingPoints(points,q):points;
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

export function localSearchHTML(id,label,query=''){
 return `<form id="${id}" class="local-search" role="search" aria-label="${esc(label)}"><div class="campus-search-field">${icon('search')}<input type="search" aria-label="${esc(label)}" placeholder="${esc(label)}" maxlength="100" autocomplete="off" enterkeyhint="search" value="${esc(query)}"><button class="icon-btn" type="button" aria-label="清除${esc(label)}" ${query?'':'hidden'}>${icon('close')}</button></div></form>`;
}
export function bindLocalSearch(form,update,query=''){
 if(!form)return;const input=form.querySelector('input'),clear=form.querySelector('button');
 input.value=query;const apply=()=>{clear.hidden=!input.value;update(cleanQuery(input.value));};
 input.oninput=apply;clear.onclick=()=>{input.value='';apply();input.focus();};form.onsubmit=e=>{e.preventDefault();apply();input.blur();};apply();
}
// Search is route-local and never persisted in the URL, session or local storage.
export function resetPageSearch(state,page){state.query=page==='search'?(state.pendingSearchQuery||''):'';state.pendingSearchQuery='';state.localQuery='';state.theme='全部';}
