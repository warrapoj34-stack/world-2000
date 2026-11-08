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
    content.replaceChildren();
    const history=ensureNews(state).history;
    for(const item of history){const row=document.createElement('li');row.textContent=`${item.icon} ${item.text} • ${fullDateName(item.date)}`;content.append(row);}
    if(!history.length){const row=document.createElement('li');row.textContent='ข่าวส่งออก เหตุการณ์ และงานผลิตจะปรากฏที่นี่';content.append(row);}
    dialog.showModal();
  });
  document.querySelector('#close-news').addEventListener('click',()=>dialog.close());
  return {refresh};
}
