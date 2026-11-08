import test from 'node:test';
import assert from 'node:assert/strict';
import { addNews,advanceNews,ensureNews,validNews } from '../js/events/news.js';
test('ข่าวเก็บล่าสุด 20 รายการ ไม่ซ้ำ และหมุนทุก 4 วินาทีตามเวลาที่เดินจริง',()=>{
  const state={date:{year:2000,month:1,day:1}};
  assert(validNews(undefined));assert.deepEqual(ensureNews(state),{history:[],index:0,elapsed:0});
  for(let i=0;i<25;i++)addNews(state,{id:String(i),icon:'📰',text:`ข่าว ${i}`});
  assert.equal(state.news.history.length,20);assert.equal(state.news.history[0].id,'24');
  addNews(state,{id:'24',icon:'📰',text:'ซ้ำ'});assert.equal(state.news.history.length,20);
  advanceNews(state,3.9);assert.equal(state.news.index,0);advanceNews(state,.1);assert.equal(state.news.index,1);
  const saved=JSON.parse(JSON.stringify(state));assert(validNews(saved.news));assert.deepEqual(saved,state);
  advanceNews(state,80);assert.equal(state.news.index,1);
  state.news.index=20;assert(!validNews(state.news));
});
