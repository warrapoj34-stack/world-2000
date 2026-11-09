import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCatalog} from '../js/data/countries.js';
import {attachResources} from '../js/data/resources.js';
import {attachMilitary,ensureMilitary} from '../js/war/military.js';
import {createGame,validGame} from '../js/state.js';
import {ensureEconomy,advanceMonth} from '../js/economy.js';
import {ensureResources} from '../js/resources.js';
import {ensureTerritories,transferProvince,provinceOwner,territoryMonth,territoryIncomeMultiplier,distributeTerritoryProduction} from '../js/territories.js';
import {warEligibility,declareWar,warTargets,selectWarTarget,setWarStance,processWarMonth,combatPower,warTraitPower,warSummary,resolveWarProtest,warOverlayState,captureChange} from '../js/war/engine.js';
import {occupationFactor} from '../js/war/occupation.js';
import {getRelation} from '../js/diplomacy/relations.js';
import {writeSave,readSave} from '../js/save/storage.js';
import {ensureProvinceEvents,chooseProvinceEvent} from '../js/events/province-events.js';
const read=async n=>JSON.parse(await readFile(new URL(`../data/${n}.json`,import.meta.url),'utf8'));
const [countries,relations,defs,levels,military,rules,traits,balance,ids,index,events]=await Promise.all(['countries_2000','relations_2000','resources','country_resources_2000','military2000','military_rules','traits','balance','playable','provinces/index','events-province'].map(read));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function setup(id='RUS'){
 const c=createCatalog(countries,relations);c.newGameCountries=ids.map(id=>c.byId.get(id));attachResources(c,defs,levels);attachMilitary(c,military,rules);c.traits=traits;c.territoryData=index;c.territoryById=new Map(Object.values(index.countries).flat().map(p=>[p.id,p]));c.provinceEvents=events;
 const s=createGame(id,c);ensureMilitary(s,c);ensureResources(s);ensureEconomy(s,balance);ensureTerritories(s);s.date.day=1;return{s,c};
}
function next(s,c,random=()=>1){const result=processWarMonth(s,c,balance,random);if(++s.date.month>12){s.date.month=1;s.date.year++;}return result;}
function captureTarget(s,c,w,id){assert(selectWarTarget(s,c,balance,w.id,id));setWarStance(s,w.id,'attack');for(let n=0;n<10&&provinceOwner(s,c.territoryById.get(id))!==s.playerCountryId;n++)next(s,c);assert.equal(provinceOwner(s,c.territoryById.get(id)),s.playerCountryId);}
test('ชายแดนจริง / ยกพลขึ้นบก 5 ลำ / ไม่มีจังหวัดยึดไม่ได้ และประกาศซ้ำไม่หักชื่อเสียง',()=>{
 for(const [player,enemy,mode]of [['RUS','UKR','land'],['THA','KHM','land'],['JPN','KHM','sea']]){
  const{s,c}=setup(player);assert.deepEqual(warEligibility(s,c,enemy,balance),{ok:true,mode});const reputation=s.countries[player].reputation;
  assert(declareWar(s,c,balance,enemy));assert.equal(s.countries[player].reputation,reputation-balance.war.reputationPenalty);assert.equal(declareWar(s,c,balance,enemy),null);assert.equal(s.countries[player].reputation,reputation-balance.war.reputationPenalty);
 }
 const{s,c}=setup('JPN');s.countries.JPN.units.ships=4;assert(!warEligibility(s,c,'KHM',balance).ok);s.countries.JPN.units.ships=5;assert(warEligibility(s,c,'KHM',balance).ok);assert(!warEligibility(s,c,'LAO',balance).ok);assert(!warEligibility(s,c,'DEU',balance).ok);assert(!warEligibility(s,c,'JPN',balance).ok);
});
test('เพื่อนร่วมกลุ่มศัตรูเสียความสัมพันธ์มากกว่าทั่วโลก โดยไม่แก้ข้อมูลตั้งต้น',()=>{
 const{s,c}=setup('THA'),before=getRelation(c,'THA','MYS').value;declareWar(s,c,balance,'KHM');assert.equal(getRelation(c,'THA','MYS',s).value,before-40);assert.equal(getRelation(c,'THA','USA',s).value,getRelation(c,'THA','USA').value-15);assert.equal(getRelation(c,'THA','KHM',s).value,-100);assert.equal(getRelation(c,'THA','MYS').value,before);
});
test('กราฟจังหวัดภายในและข้ามประเทศสมมาตร ไม่มีเพื่อนบ้านที่ไม่มีอยู่',()=>{
 for(const [id,neighbors]of Object.entries(index.provinceNeighbors))for(const n of neighbors){assert(index.provinceNeighbors[n].includes(id));assert.notEqual(id,n);}
 assert(index.provinceNeighbors['TH-27'].some(id=>id.startsWith('KH-')));assert(index.provinceNeighbors['UA-63'].some(id=>id.startsWith('RU-')));
});
test('ภูเขา ป่า หนาวฤดูหนาว เรือเฉพาะชายฝั่ง และจุดเด่นประเทศมีผลจริง',()=>{
 const{s,c}=setup('JPN'),p={id:'sample',share:1,terrain:'plain',coastal:false};const power=q=>combatPower(s,c,balance,'JPN',q,{defending:true});const base=power(p);
 near(power({...p,terrain:'mountain'}),base*1.3);near(power({...p,terrain:'forest'}),base*1.2);near(power({...p,terrain:'cold'}),base*1.2);s.date.month=7;near(power({...p,terrain:'cold'}),base);
 assert(combatPower(s,c,balance,'JPN',{...p,coastal:true})>combatPower(s,c,balance,'JPN',p));assert(warTraitPower(s,c,'JPN',balance,'aircraft')>1);assert(warTraitPower(s,c,'JPN',balance,'tanks')<1);assert(captureChange(0,0,balance.war)<0);
});
test('รัสเซีย ไทย และญี่ปุ่นยึดได้จริงผ่าน transferProvince และประชากรโลกคงเดิม',()=>{
 for(const [player,enemy,target]of [['RUS','UKR','UA-63'],['THA','KHM','KH-1'],['JPN','KHM','KH-18']]){
  const{s,c}=setup(player),sum=()=>Object.values(s.countries).reduce((n,a)=>n+Math.round(a.population*1e6),0),people=sum(),w=declareWar(s,c,balance,enemy),units=s.countries[player].units.tanks;
  captureTarget(s,c,w,target);assert.equal(sum(),people);assert(s.countries[player].units.tanks<units);assert(w.lastBattle.losses.enemy.tanks>0);assert.equal(warSummary(s,c,w).gained,1);assert(s.news.history.some(n=>n.id.startsWith('capture:')));assert(validGame(s,c));
  transferProvince(s,c,target,enemy);assert.equal(warSummary(s,c,w).gained,0);
 }
});
test('เลือกได้เป้าหมายเดียว ยึดชายแดนแล้วรุกจังหวัดภายในได้ ตั้งรับลดหลอด',()=>{
 const{s,c}=setup('THA'),w=declareWar(s,c,balance,'KHM');captureTarget(s,c,w,'KH-1');assert(warTargets(s,c,'THA','KHM',balance).some(t=>t.province.id==='KH-17'));
 selectWarTarget(s,c,balance,w.id,'KH-17');w.progress=40;setWarStance(s,w.id,'defend');next(s,c);assert.equal(w.progress,32);
 const other=declareWar(s,c,balance,'MMR');const target=warTargets(s,c,'THA','MMR',balance)[0].province.id;assert(selectWarTarget(s,c,balance,other.id,target));assert.equal(w.target,null);assert.equal(w.progress,0);assert.equal(warOverlayState(s,c,balance).filter(w=>w.target).length,1);
});
test('คำนวณครั้งเดียวต่อเดือน เสียยูนิตจำนวนเต็ม เงินและความสุขลดจริง',()=>{
 const{s,c}=setup(),w=declareWar(s,c,balance,'UKR');selectWarTarget(s,c,balance,w.id,'UA-63');const before=structuredClone(s.countries);processWarMonth(s,c,balance,()=>1);const once=structuredClone(s);assert.deepEqual(processWarMonth(s,c,balance,()=>1),{costs:{},borrowed:{}});assert.deepEqual(s,once);
 for(const id of ['RUS','UKR']){assert(s.countries[id].treasury<before[id].treasury);assert(s.countries[id].happiness<before[id].happiness);assert(s.countries[id].units.tanks<before[id].units.tanks);for(const n of Object.values(s.countries[id].units))assert(Number.isInteger(n)&&n>=0);}
});
test('รายงานเดือนรวมค่าสงครามและหนี้จริง ไม่หักเงินซ้ำ',()=>{
 const{s,c}=setup('THA');declareWar(s,c,balance,'KHM');s.countries.THA.treasury=0;const report=advanceMonth(s,c,balance,()=>1);assert(report.fiscal.warSpending>0);assert(report.fiscal.borrowed>=report.fiscal.warSpending);assert.equal(s.warfare.wars[0].months,1);assert(validGame(s,c));
});
test('AI ตีโต้จังหวัดอ่อนแอและยึดของเราได้ ไม่แจ้งว่ายึดเมืองหลวงซ้ำทุกเดือน',()=>{
 const{s,c}=setup('UKR');s.countries.UKR.units={tanks:1,ships:0,aircraft:1};const w=declareWar(s,c,balance,'RUS');const candidates=warTargets(s,c,'RUS','UKR',balance),weak=candidates.sort((a,b)=>combatPower(s,c,balance,'UKR',a.province,{defending:true,stance:'attack'})-combatPower(s,c,balance,'UKR',b.province,{defending:true,stance:'attack'})||a.province.id.localeCompare(b.province.id))[0];next(s,c);assert.equal(w.counter.target,weak.province.id);
 for(let i=0;i<3;i++)next(s,c);assert(warSummary(s,c,w).lost>0);transferProvince(s,c,'UA-30','RUS');next(s,c);assert(s.warfare.notices.some(n=>n.id.includes('capital')));const count=s.warfare.notices.length;next(s,c);assert.equal(s.warfare.notices.length,count);
});
test('ยึดใหม่ได้รายรับ/ผลผลิตครึ่งเดียว 12 เดือน ต่อต้านลดเพิ่มและหมดอายุจริง',()=>{
 const{s,c}=setup(),w=declareWar(s,c,balance,'UKR');captureTarget(s,c,w,'UA-63');const p=c.territoryById.get('UA-63'),month=territoryMonth(s),o=s.warfare.occupations[p.id];near(occupationFactor(s,p.id,'RUS'),.5);near(territoryIncomeMultiplier(s,c,'RUS'),1+s.countries.UKR.gdp/s.countries.RUS.gdp*p.share/100*.5);
 const base=Object.fromEntries(c.countries.map(a=>[a.id,{oil:a.id==='UKR'?10000:0}])),output=distributeTerritoryProduction(s,c,base);assert.equal(output.RUS.oil,Math.round(p.share*50));
 processWarMonth(s,c,balance,()=>0);near(occupationFactor(s,p.id,'RUS'),.25);assert(s.news.history.some(n=>n.id.startsWith('resistance:')));s.date={year:Math.floor(o.untilMonth/12),month:o.untilMonth%12+1,day:1};near(occupationFactor(s,p.id,'RUS'),1);assert(o.untilMonth>=month+11);
});
test('ประท้วงเมื่อความสุขต่ำ เลือกช่วยต้องมีเงินจริง เซฟเก่าและเซฟระหว่างรบโหลดได้',()=>{
 const{s,c}=setup('THA'),w=declareWar(s,c,balance,'KHM');selectWarTarget(s,c,balance,w.id,'KH-1');s.countries.THA.happiness=19;next(s,c);assert(s.warfare.protest);const treasury=s.countries.THA.treasury;s.countries.THA.treasury=0;assert(!resolveWarProtest(s,balance,'relief'));s.countries.THA.treasury=treasury;
 let raw;const store={getItem:()=>raw,setItem:(_,v)=>raw=v};assert(writeSave('game',s,c,store).ok);const loaded=readSave('game',c,store);assert.equal(loaded.status,'valid');assert.deepEqual(loaded.state.warfare,s.warfare);assert.deepEqual(loaded.state.territories,s.territories);assert(resolveWarProtest(loaded.state,balance,'relief'));
 loaded.state.warfare.wars[0].progress=-1;assert(!validGame(loaded.state,c));delete loaded.state.warfare;assert(validGame(loaded.state,c));assert(writeSave('game',loaded.state,c,store).ok);assert.equal(readSave('game',c,store).status,'valid');
});
test('ใช้กำลังในข้อพิพาทเริ่มป้องกันจังหวัดของเรา โดยไม่ย้ายเจ้าของทันที',()=>{
 const{s,c}=setup('THA');ensureProvinceEvents(s).pending={eventId:'border-claim',provinceId:'TH-27',claimant:'KHM',month:territoryMonth(s)};assert.equal(chooseProvinceEvent(s,c,balance,'force'),null);const w=declareWar(s,c,balance,'KHM',{provinceId:'TH-27'});assert(w);assert.equal(w.target,'TH-27');assert.equal(w.stance,'defend');assert(chooseProvinceEvent(s,c,balance,'force'));assert.equal(provinceOwner(s,c.territoryById.get('TH-27')),'THA');
});
test('เหลือดินแดนต่ำกว่า 30% แม้ไม่เสียเมืองหลวง ต้องแจ้งเตือนเจรจา',()=>{
 const{s,c}=setup('THA');declareWar(s,c,balance,'KHM');for(const p of index.countries.THA)if(p.id!=='TH-10')transferProvince(s,c,p.id,'KHM');next(s,c);assert(s.warfare.notices.some(n=>n.id==='negotiate:1:THA:territory'));assert.equal(provinceOwner(s,c.territoryById.get('TH-10')),'THA');
});
test('ข้อมูลสงครามเสียหายไม่ทำให้ตัวตรวจเซฟโยน error',()=>{
 const{s,c}=setup();declareWar(s,c,balance,'UKR');s.warfare.wars=[null];assert.equal(validGame(s,c),false);
});
