import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recordExport,takeMonthlyExports,exportVisualCount,nearestSea,seaRoute,curvedSeaPath,pathSampler,flightPath } from '../js/map/trade-data.js';
import { geoContains,geoBounds } from '../lib/d3-7.9.0.js';
import { prepareWorld } from '../js/data/world.js';
const read=async n=>JSON.parse(await readFile(new URL(`../data/${n}.json`,import.meta.url)));
const [grid,ports,ids]=await Promise.all(['sea_grid','trade_ports','playable'].map(read));
test('เก็บยอดขายจริงโดยไม่เปลี่ยนเงิน รวมรายเดือนและไม่แสดงซ้ำ',()=>{
 const state={date:{year:2000,month:1},playerCountryId:'USA',countries:{USA:{treasury:10}}};
 recordExport(state,'oil',10,.03);recordExport(state,'oil',10,.036);recordExport(state,'gold',10,.1);
 assert.equal(state.countries.USA.treasury,10);assert.equal(state.exportVisuals.length,2);assert.equal(takeMonthlyExports(state).length,0);
 state.date.month=2;const exports=takeMonthlyExports(state);assert.equal(exports.length,2);assert.equal(exports[0].units,20);assert.equal(exports[0].value,.066);assert.equal(exportVisualCount(exports),3);assert.deepEqual(takeMonthlyExports(state),[]);
 assert.equal(exportVisualCount([{units:10000}]),30);assert.equal(exportVisualCount([]),0);assert.equal(exportVisualCount([{units:10000}],8),8);
});
test('ท่าเรือครบ 40 ประเทศและเส้นทางอยู่บนเครือข่ายทะเลที่เชื่อมต่อได้',()=>{
 for(const id of ids){assert(ports[id]);const start=nearestSea(grid,ports[id].point);assert.equal(grid.water[start],'1');const path=seaRoute(grid,start,nearestSea(grid,ports.USA.point));assert(path.length>=2,id);const sample=pathSampler(curvedSeaPath(path));assert(sample(.5).every(Number.isFinite));}
 const route=seaRoute(grid,nearestSea(grid,ports.CHN.point),nearestSea(grid,ports.USA.point));assert(route.some(p=>p[0]===-79.7&&p[1]===9.1));
});
test('เส้นทางเครื่องบินข้ามเส้นวันที่ไม่ลากอ้อมโลกและมีส่วนโค้ง',()=>{
 const points=flightPath([170,10],[-170,10]);assert.equal(points.at(-1)[0],190);assert(points[16][1]>10);assert.deepEqual(pathSampler(points)(0),[170,10]);
});
test('สุ่มตรวจแนวเส้นทางข้ามทวีป ไม่ตัดแผ่นดินนอกบริเวณคลองเดินเรือ',async()=>{
 const [topology,names,settings]=await Promise.all(['countries-50m','country-names-th','world-2000'].map(read));
 const world=prepareWorld(topology,names,settings);
 const polygons=world.countries.flatMap(c=>(c.geometry.type==='Polygon'?[c.geometry.coordinates]:c.geometry.coordinates).map(coordinates=>{const geometry={type:'Polygon',coordinates};return {id:c.id,geometry,bounds:geoBounds(geometry)};}));
 for(const [a,b]of [['CHN','USA'],['FRA','JPN'],['SAU','THA'],['RUS','AUS'],['ARG','CHN'],['EGY','CHN']]){
  const sample=pathSampler(curvedSeaPath(seaRoute(grid,nearestSea(grid,ports[a].point),nearestSea(grid,ports[b].point))));
  for(let i=0;i<=1000;i++){
   let [x,y]=sample(i/1000);x=((x+180)%360+360)%360-180;
   const land=polygons.find(p=>{const[[lo,bottom],[hi,top]]=p.bounds;return y>=bottom&&y<=top&&(lo<=hi?x>=lo&&x<=hi:x>=lo||x<=hi)&&geoContains(p.geometry,[x,y]);});
   if(land)assert(land.id==='591'&&x>=-80.2&&x<=-79.3&&y>=8.5&&y<=9.6||land.id==='818'&&x>=32&&x<=33.5&&y>=29.3&&y<=31.6,`${a}-${b} crosses ${land.id} ${x},${y}`);
  }
 }
});
