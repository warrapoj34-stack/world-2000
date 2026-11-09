import { ensureNews } from '../events/news.js';
import { fullDateName } from './stats.js';
export function createNewsScreen(getState){
  const button=document.querySelector('#news-ticker'),dialog=document.querySelector('#news-dialog'),content=document.querySelector('#news-history');
  function refresh(){
    const state=getState();if(!state)return;
    const news=ensureNews(state),item=news.history[news.index];
    const text=item?`${item.icon} ${item.text}`:'📰 ยังไม่มีข่าวใหม่ • แตะเพื่อดูประวัติ';
    if(button.textContent!==text)button.textContent=text;
  }
  button.addEventListener('click',()=>{
    const state=getState();if(!state)return;
    const latest=ensureNews(state).history[ensureNews(state).index];
    if(latest?.provinceId&&state.provinceEvents?.pending?.provinceId===latest.provinceId){document.dispatchEvent(new CustomEvent('open-territory-event',{detail:latest.provinceId}));return;}
    content.replaceChildren();
    const history=ensureNews(state).history;
    for(const item of history){const row=document.createElement('li');row.textContent=`${item.icon} ${item.text} • ${fullDateName(item.date)}`;if(item.provinceId){const focus=document.createElement('button');focus.type='button';focus.className='map-button news-province';focus.textContent='ดูพื้นที่';focus.onclick=()=>{dialog.close();document.dispatchEvent(new CustomEvent('open-territory-event',{detail:item.provinceId}));};row.append(focus);}content.append(row);}
    if(!history.length){const row=document.createElement('li');row.textContent='ข่าวส่งออก เหตุการณ์ และงานผลิตจะปรากฏที่นี่';content.append(row);}
    dialog.showModal();
  });
  document.querySelector('#close-news').addEventListener('click',()=>dialog.close());
  return {refresh};
}
