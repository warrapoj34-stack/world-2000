import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {geoContains} from '../lib/d3-7.9.0.js';
import {createCatalog} from '../js/data/countries.js';import{createGame,validGame}from'../js/state.js';
import{loadTerritories,loadTerritoryMaps}from'../js/data/territories.js';
import{territoryUnits,territorySummary,isTerritoryCapturable,crossBorderProvinces,ensureTerritories,createTerritoryController,territoryIncomeMultiplier}from'../js/territories.js';
import{readSave,writeSave}from'../js/save/storage.js';import{prepareWorld}from'../js/data/world.js';
const read=async name=>JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8'));
const [countries,relations,index,playable,topology,names,settings]=await Promise.all(['countries_2000','relations_2000','provinces/index','playable','countries-50m','country-names-th','world-2000'].map(read));
const maps=Object.fromEntries(await Promise.all(Object.entries(index.files).map(async([id,file])=>[id,await read('provinces/'+file.replace('.json',''))])));
function catalog(){const c=createCatalog(countries,relations);c.territoryData=index;c.territoryById=new Map(Object.values(index.countries).flat().map(p=>[p.id,p]));c.territoryMaps=new Map();return c;}
function near(a,b){assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
test('รัสเซีย 89 หน่วยเดิมยังแยกกัน และนครมอสโกไม่กินพื้นที่ที่ขยายปี 2012',()=>{
 const all=maps.RUS.features;assert.equal(all.length,89);
 for(const [id,point]of [['RU-KOP',[54.65,59.01]],['RU-AGB',[114.53,51.10]],['RU-EVE',[100.23,64.28]],['RU-TAY',[86.17,69.4]],['RU-UOB',[104.75,52.8]],['RU-KOR',[159.95,59.08]],['RU-MOW',[37.62,55.75]],['RU-MOS',[37.30,55.48]]]){
  assert(geoContains(all.find(f=>f.id===id),point),id);assert.equal(all.filter(f=>geoContains(f,point)).length,1,id+' ไม่ทับหน่วยอื่น');
 }
 assert(!all.some(f=>f.id.startsWith('UA-')));assert(!all.some(f=>f.id==='RU-ZAB'));
});
test('ไครเมียและเซวาสโตโพลเป็นของยูเครน ทั้งระดับจังหวัดและแผนที่โลก โดยไม่แก้ topology ต้นฉบับ',()=>{
 const original=JSON.stringify(topology),c=catalog(),world=prepareWorld(topology,names,settings);
 assert.equal(maps.UKR.features.length,27);
 for(const [id,point]of [['UA-43',[34.1,44.95]],['UA-40',[33.53,44.6]]]){assert.equal(c.territoryById.get(id).owner,'UKR');assert(geoContains(maps.UKR.features.find(f=>f.id===id),point));assert(geoContains(world.countries.find(c=>c.id==='804'),point));assert(!geoContains(world.countries.find(c=>c.id==='643'),point));}
 assert.equal(JSON.stringify(topology),original);
});
test('ประเทศเพื่อนบ้านไทยมีหน่วยปี 2000 ปุตราจายารวมสลังงอร์ ไชยสมบูรณ์ใช้ชื่อเขตพิเศษ',()=>{
 const c=catalog();assert.equal(maps.MMR.features.length,14);assert.equal(maps.LAO.features.length,18);assert.equal(maps.KHM.features.length,24);assert.equal(maps.MYS.features.length,15);
 assert(!c.territoryById.has('MY-16'));assert(geoContains(maps.MYS.features.find(f=>f.id==='MY-10'),[101.69,2.93]));assert(c.territoryById.get('LA-XN').nameTh.includes('เขตพิเศษ'));assert(c.territoryById.has('LA-VT'));assert(c.territoryById.has('LA-VI'));
 assert(!c.territoryById.has('MM-18'));assert(!c.territoryById.has('KH-25'));
 const ids=Array.isArray(playable)?playable:playable.countries;assert.equal(ids.length,40);for(const id of ['MMR','LAO','KHM'])assert(!ids.includes(id));assert(ids.includes('RUS')&&ids.includes('UKR'));
});
test('กราฟชายแดนข้ามประเทศถูกคู่และสมมาตร สระแก้ว–กัมพูชา และคาร์คิฟ–เบลโกรอด',()=>{
 const c=catalog();assert.deepEqual(c.territoryById.get('TH-27').borders,['KHM']);assert.deepEqual(crossBorderProvinces(c,'TH-27').map(p=>p.id),['KH-1','KH-2']);assert.deepEqual(crossBorderProvinces(c,'UA-63').map(p=>p.id),['RU-BEL']);
 assert(!crossBorderProvinces(c,'UA-43').some(p=>p.owner==='RUS'));
 for(const [id,others]of Object.entries(index.adjacency)){const p=c.territoryById.get(id);for(const other of others){const q=c.territoryById.get(other);assert(q);assert.notEqual(p.owner,q.owner);assert(index.adjacency[other].includes(id));assert(p.borders.includes(q.owner),id+' '+other);}}
});
test('ชายฝั่งแยกจากทะเลสาบ และภูมิประเทศมีครบทั้ง 11 ประเทศ',()=>{
 const c=catalog();for(const p of c.territoryById.values()){assert.equal(typeof p.coastal,'boolean');assert(['plain','mountain','forest','cold'].includes(p.terrain));}
 for(const id of ['UA-43','UA-40','RU-KOR','TH-10','MY-12'])assert(c.territoryById.get(id).coastal,id);
 for(const id of ['TH-50','US-MI','UA-63','RU-KOP','MY-14'])assert(!c.territoryById.get(id).coastal,id);
 assert(index.countries.LAO.every(p=>!p.coastal));assert.equal(c.territoryById.get('RU-SA').terrain,'cold');assert.equal(c.territoryById.get('TH-50').terrain,'mountain');
});
test('ประเทศไม่มีข้อมูลเป็นหนึ่งหน่วยทั้งประเทศ ยึดไม่ได้ และเงิน/ผู้ครองเดิมไม่เปลี่ยน',()=>{
 const c=catalog(),s=createGame('THA',c),before=structuredClone(s);const units=territoryUnits(c,'VNM');assert.equal(units.length,1);assert.equal(units[0].share,100);assert.equal(units[0].capturable,false);assert.equal(territorySummary(s,c,'VNM').total,1);assert.equal(territorySummary(s,c,'VNM').percent,100);assert(!isTerritoryCapturable(c,units[0].id));assert.throws(()=>createTerritoryController(s,c).transferProvince(units[0].id,'THA'));assert.deepEqual(s,before);
});
test('lazy load เฉพาะเรา/เพื่อนบ้าน/คู่สงคราม ใช้แคชซ้ำ และเพื่อนบ้านขาดไฟล์ออฟไลน์ยังเปิดเราได้',async()=>{
 const c=catalog(),s=createGame('THA',c),calls=[],original=globalThis.fetch;
 globalThis.fetch=async url=>{const file=String(url).split('/').at(-1);calls.push(file);return{ok:true,json:async()=>file==='index.json'?structuredClone(index):structuredClone(Object.values(maps).find(d=>index.files[d.countryId]===file))}};
 try{await loadTerritories(c);assert.deepEqual(calls,['index.json']);await loadTerritoryMaps(s,c);assert.deepEqual([...c.territoryMaps.keys()].sort(),['THA','MMR','LAO','KHM','MYS'].sort());assert.equal(c.territoryFeatures.length,147);assert(!calls.includes('ru.json'));const count=calls.length;await loadTerritoryMaps(s,c);assert.equal(calls.length,count);
 await loadTerritoryMaps(s,c,{opponents:['UKR']});assert(c.territoryMaps.has('UKR'));assert(!c.territoryMaps.has('RUS'));assert(!c.territoryMaps.has('CHN'));
 c.territoryMaps=new Map([['THA',maps.THA]]);globalThis.fetch=async()=>({ok:false});await loadTerritoryMaps(s,c);assert.deepEqual([...c.territoryMaps.keys()],['THA']);assert(c.territoryUnavailable.includes('MMR'));await assert.rejects(loadTerritoryMaps(s,c,{opponents:['RUS']}));
 }finally{globalThis.fetch=original;}
});
test('เซฟก่อนเพิ่มรัสเซีย/ยูเครนยังโหลดและโอนกลับได้ คงเงิน วันที่ นาฬิกา และ share เก่า',()=>{
 const c=catalog(),s=createGame('THA',c);s.clock={progress:.35,speed:2,userPaused:true};ensureTerritories(s);createTerritoryController(s,c).transferProvince('TH-50','RUS');const snapshot=structuredClone(s);let raw;const storage={setItem:(_,v)=>raw=v,getItem:()=>raw};assert(writeSave('game',s,c,storage).ok);const old=JSON.parse(raw);old.gameVersion='0.9.8';old.state.provinces={queue:[{anything:'ข้าม'}]};raw=JSON.stringify(old);const loaded=readSave('game',c,storage);assert.equal(loaded.status,'valid');assert.deepEqual(loaded.state,snapshot);assert(validGame(loaded.state,c));createTerritoryController(loaded.state,c).transferProvince('TH-50','THA');near(territoryIncomeMultiplier(loaded.state,c,'RUS'),1);assert.deepEqual(loaded.state.clock,snapshot.clock);assert.equal(loaded.state.countries.THA.treasury,snapshot.countries.THA.treasury);
});
