import { geoCentroid } from '../../lib/d3-7.9.0.js';
import { takeMonthlyExports, exportVisualCount, nearestSea, seaRoute, curvedSeaPath, flightPath, pathSampler } from '../map/trade-data.js';
import { formatMoney } from './stats.js';
export async function loadTradeVisualData() {
  return Promise.all(['sea_grid','trade_ports'].map(async file=>{const r=await fetch(new URL(`../../data/${file}.json`,import.meta.url));if(!r.ok)throw new Error('ข้อมูลภาพขนส่งไม่พร้อม');return r.json();}));
}
export function createTradeVisuals({map,world,catalog,getState,onChange,data}) {
  const canvas=document.querySelector('#trade-canvas'),ctx=canvas.getContext('2d'),toggle=document.querySelector('#trade-animation'),status=document.querySelector('#trade-animation-status'),info=document.querySelector('#trade-info');
  if(!ctx||!data){toggle.disabled=true;status.textContent='ภาพส่งออกยังไม่พร้อม';return;}
  const [grid,ports]=data,partners=catalog.newGameCountries,highValue=new Set(['gold','rare_earths','uranium']);
  const routeCache=new Map(),locations=new Map();let stateRef=null,vessels=[],pending=[],floats=[],frame=0,last=performance.now(),width=0,height=0,ratio=1,cap=30,average=16,slowFrames=0;
  let seed=crypto.getRandomValues(new Uint32Array(1))[0];const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  let enabled=true;try{enabled=localStorage.getItem('world-2000:trade-animation')!=='off';}catch{/* ใช้ค่าชั่วคราว */}toggle.checked=enabled;
  function location(id){
    if(!locations.has(id)){const record=catalog.byId.get(id),shape=world.countries.find(c=>c.id===record.mapId),air=geoCentroid(shape),port=ports[id]??{nameTh:'จุดออกทะเลใกล้ประเทศ (ภาพประมาณ)',point:air};locations.set(id,{...port,air,node:nearestSea(grid,port.point)});}return locations.get(id);
  }
  function route(from,to,air){const key=`${from}:${to}:${air}`;if(!routeCache.has(key)){const a=location(from),b=location(to),points=air?flightPath(a.air,b.air):curvedSeaPath(seaRoute(grid,a.node,b.node));if(routeCache.size>=96)routeCache.delete(routeCache.keys().next().value);routeCache.set(key,points.length>=2?pathSampler(points):null);}return routeCache.get(key);}
  function blocked(state){return document.hidden||document.querySelector('#map-screen').hidden||Boolean(document.querySelector('dialog[open]'))||state.clock?.userPaused||state.economy?.gameOver||state.victory?.finished;}
  function project(point,transform){const lon=((point[0]+180)%360+360)%360-180;return [transform.x+(lon+180)/360*world.settings.map.width*transform.k,transform.y+(90-point[1])/180*world.settings.map.height*transform.k];}
  function addMonthly(entries){
    const available=Math.max(0,Math.min(cap-vessels.length-pending.length,exportVisualCount(entries,cap)));if(!available)return;
    const rows=[...entries].sort((a,b)=>b.units-a.units),counts=rows.map(()=>0);
    for(let i=0;i<available;i++){let pick=i<rows.length?i:0;if(i>=rows.length)for(let j=1;j<rows.length;j++)if(rows[j].units/(counts[j]+1)>rows[pick].units/(counts[pick]+1))pick=j;counts[pick]++;}
    rows.forEach((entry,index)=>{const count=counts[index];for(let i=0;i<count;i++){
      const units=Math.floor(entry.units/count)+(i<entry.units%count?1:0),pool=partners.filter(c=>c.id!==entry.countryId);
      pending.push({...entry,units,value:entry.value*units/entry.units,to:pool[Math.floor(random()*pool.length)].id,air:highValue.has(entry.resourceId)});
    }});
  }
  function draw(){
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const transform=map.getTransform();
    for(const ship of vessels){const p=ship.sample(ship.progress),q=ship.sample(Math.min(1,ship.progress+.002)),[x,y]=project(p,transform);ship.screen=[x,y];
      if(x<-20||x>width+20||y<-20||y>height+20)continue;
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(-(q[1]-p[1]),q[0]-p[0]));ctx.lineWidth=1;ctx.strokeStyle='#08263b';ctx.fillStyle=ship.air?'#fff4bf':'#e3f4ec';
      ctx.beginPath();if(ship.air){ctx.moveTo(9,0);ctx.lineTo(-6,-7);ctx.lineTo(-3,0);ctx.lineTo(-6,7);}else{ctx.moveTo(9,0);ctx.lineTo(4,-4);ctx.lineTo(-7,-4);ctx.lineTo(-7,4);ctx.lineTo(4,4);}ctx.closePath();ctx.fill();ctx.stroke();
      if(!ship.air){ctx.fillStyle='#3c959e';ctx.fillRect(-5,-2,7,4);}ctx.restore();
    }
    ctx.font='bold 14px Tahoma, sans-serif';ctx.textAlign='center';
    for(const item of floats){const [x,y]=project(item.point,transform);ctx.globalAlpha=Math.max(0,1-item.age/2);ctx.fillStyle='#9cf5a2';ctx.strokeStyle='#06322a';ctx.lineWidth=3;const text=`+${formatMoney(item.value)}`;ctx.strokeText(text,x,y-item.age*16);ctx.fillText(text,x,y-item.age*16);}ctx.globalAlpha=1;
  }
  function tick(now){
    frame=0;const raw=(now-last)/1000;last=now;const state=getState();
    if(state!==stateRef){stateRef=state;vessels=[];pending=[];floats=[];info.hidden=true;}
    if(state){const entries=takeMonthlyExports(state);if(entries.length){addMonthly(entries);onChange();}
      const delta=blocked(state)?0:Math.max(0,raw)*(state.clock?.speed??1);
      if(delta>0&&raw<1){average=average*.98+raw*1000*.02;if(average>35){slowFrames++;if(slowFrames>90&&cap>8){cap=cap>15?15:8;vessels=vessels.slice(0,cap);pending=pending.slice(0,Math.max(0,cap-vessels.length));slowFrames=0;}}else slowFrames=0;}
      if(pending.length&&vessels.length<cap){const job=pending.shift(),sample=route(job.countryId,job.to,job.air);if(sample)vessels.push({...job,sample,progress:0,duration:job.air?10:22,screen:null,justSpawned:true});}
      for(const ship of vessels){if(ship.justSpawned)ship.justSpawned=false;else ship.progress+=delta/ship.duration;}
      floats.forEach(item=>item.age+=delta);
      for(const ship of vessels.filter(v=>v.progress>=1))floats.push({point:ship.sample(1),value:ship.value,age:0});
      vessels=vessels.filter(v=>v.progress<1);floats=floats.filter(item=>item.age<2);
    }
    if(canvas.dataset.vessels!==String(vessels.length))canvas.dataset.vessels=String(vessels.length);
    const caption=`ภาพจากยอดขายรายเดือน • ${vessels.length} เที่ยว • จำกัด ${cap}`;if(status.textContent!==caption)status.textContent=caption;
    if(!document.hidden&&!document.querySelector('#map-screen').hidden)draw();
    if(enabled)frame=requestAnimationFrame(tick);
  }
  function hit(x,y){if(!enabled)return false;const ship=[...vessels].reverse().find(v=>v.screen&&Math.hypot(v.screen[0]-x,v.screen[1]-y)<=22);if(!ship)return false;
    const resource=catalog.resourceDefinitions.find(r=>r.id===ship.resourceId),destination=catalog.byId.get(ship.to);
    document.querySelector('#trade-info-text').textContent=`${ship.air?'✈️':'🚢'} ${resource.nameTh} ${ship.units} หน่วย → ${destination.nameTh} • ${formatMoney(ship.value)}${ship.air?'':` • ${location(ship.countryId).nameTh} → ${location(ship.to).nameTh}`} • ภาพประกอบยอดขายที่รับเงินแล้ว ไม่บวกเงินซ้ำ`;
    info.hidden=false;return true;
  }
  map.setVisualHitTest(hit);
  document.querySelector('#close-trade-info').addEventListener('click',()=>{info.hidden=true;});
  function resize(){const box=document.querySelector('#world-map').getBoundingClientRect();width=box.width;height=box.height;ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);if(enabled)draw();}
  const observer=new ResizeObserver(resize);observer.observe(document.querySelector('#world-map'));resize();
  toggle.addEventListener('change',()=>{enabled=toggle.checked;canvas.hidden=!enabled;cancelAnimationFrame(frame);frame=0;if(!enabled){vessels=[];pending=[];floats=[];info.hidden=true;}else{if(getState())takeMonthlyExports(getState());last=performance.now();frame=requestAnimationFrame(tick);}try{localStorage.setItem('world-2000:trade-animation',enabled?'on':'off');}catch{/* ใช้ค่าชั่วคราว */}status.textContent=enabled?'เปิดภาพส่งออก':'ปิดภาพส่งออก • ประหยัดแบต';});
  document.querySelector('#map-quality').addEventListener('change',event=>{cap=event.target.value==='low'?12:30;vessels=vessels.slice(0,cap);pending=pending.slice(0,Math.max(0,cap-vessels.length));});
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  canvas.hidden=!enabled;if(enabled)frame=requestAnimationFrame(tick);else status.textContent='ปิดภาพส่งออก • ประหยัดแบต';
  return {destroy:()=>{cancelAnimationFrame(frame);observer.disconnect();map.setVisualHitTest(null);}};
}
