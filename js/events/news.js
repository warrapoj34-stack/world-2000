export function ensureNews(state){
  return state.news??={history:[],index:0,elapsed:0};
}
export function addNews(state,item){
  const news=ensureNews(state);
  if(news.history.some(entry=>entry.id===item.id))return;
  news.history.unshift({...item,date:{...state.date}});
  news.history=news.history.slice(0,20);news.index=0;news.elapsed=0;
}
export function advanceNews(state,seconds){
  const news=ensureNews(state);
  news.elapsed+=Math.max(0,seconds);
  const steps=Math.floor(news.elapsed/4);news.elapsed%=4;
  if(news.history.length)news.index=(news.index+steps)%news.history.length;
}
export function validNews(news){
  return news===undefined||Boolean(news&&Array.isArray(news.history)&&news.history.length<=20
    &&Number.isInteger(news.index)&&news.index>=0&&news.index<Math.max(1,news.history.length)
    &&Number.isFinite(news.elapsed)&&news.elapsed>=0&&news.elapsed<4
    &&news.history.every(item=>typeof item.id==='string'&&typeof item.icon==='string'&&typeof item.text==='string'
      &&Number.isInteger(item.date?.year)&&Number.isInteger(item.date.month)&&item.date.month>=1&&item.date.month<=12));
}
