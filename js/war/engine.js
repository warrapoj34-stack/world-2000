import { provinceOwner,territoryMonth,transferProvince } from '../territories.js';
import { occupationFactor } from './occupation.js';
import { traitModifiers } from '../traits.js';
import { addNews } from '../events/news.js';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const keys=['tanks','aircraft','ships'];
export const ensureWarfare=state=>state.warfare??={version:1,nextId:1,revision:0,lastMonth:null,wars:[],occupations:{},relations:{},notices:[],protest:null,lastProtestMonth:null,activeId:null};
export const warOpponents=state=>(state.warfare?.wars??[]).map(w=>w.enemy);
export const ownedProvinces=(state,catalog,id)=>[...(catalog.territoryById?.values()??[])].filter(p=>provinceOwner(state,p)===id);
export const provinceNeighbors=(catalog,id)=>(catalog.territoryData?.provinceNeighbors?.[id]??catalog.territoryData?.adjacency?.[id]??[]).map(id=>catalog.territoryById.get(id)).filter(Boolean);
function ended(state){return Boolean(state.economy?.gameOver||state.victory?.finished);}
export function invasionPossible(state,catalog,attacker,defender,balance){
  return (state.countries[attacker]?.units?.ships??0)>=balance.war.minimumInvasionShips
    &&ownedProvinces(state,catalog,attacker).some(p=>p.coastal)&&ownedProvinces(state,catalog,defender).some(p=>p.coastal);
}
export function warTargets(state,catalog,attacker,defender,balance){
  const naval=invasionPossible(state,catalog,attacker,defender,balance);
  return ownedProvinces(state,catalog,defender).flatMap(p=>{
    if(provinceNeighbors(catalog,p.id).some(n=>provinceOwner(state,n)===attacker))return [{province:p,via:'land'}];
    return naval&&p.coastal?[{province:p,via:'sea'}]:[];
  });
}
export function warEligibility(state,catalog,enemy,balance){
  const player=state.playerCountryId;
  if(ended(state))return {ok:false,reason:'เกมจบแล้ว'};
  if(!catalog.byId.has(enemy)||enemy===player)return {ok:false,reason:'เลือกประเทศอื่นก่อน'};
  if(state.warfare?.wars.some(w=>w.enemy===enemy))return {ok:false,reason:'กำลังทำสงครามกับประเทศนี้'};
  if(!ownedProvinces(state,catalog,player).length||!ownedProvinces(state,catalog,enemy).length)return {ok:false,reason:'รอบนี้รบได้เฉพาะประเทศที่มีข้อมูลจังหวัด'};
  const targets=warTargets(state,catalog,player,enemy,balance);
  return targets.length?{ok:true,mode:targets.some(t=>t.via==='land')?'land':'sea'}:{ok:false,reason:`ต้องมีชายแดนติดกัน หรือเรือรบอย่างน้อย ${balance.war.minimumInvasionShips} ลำและชายฝั่งทั้งสองฝ่าย`};
}
export function declareWar(state,catalog,balance,enemy,{provinceId=null}={}){
  const eligibility=warEligibility(state,catalog,enemy,balance);if(!eligibility.ok)return null;
  const player=state.playerCountryId,p=provinceId&&catalog.territoryById.get(provinceId);
  if(provinceId&&(!p||!warTargets(state,catalog,player,enemy,balance).some(t=>t.province.id===provinceId)
    &&!(provinceOwner(state,p)===player&&warTargets(state,catalog,enemy,player,balance).some(t=>t.province.id===provinceId))))return null;
  const data=ensureWarfare(state),war={id:data.nextId++,enemy,mode:eligibility.mode,months:0,stance:p&&provinceOwner(state,p)===player?'defend':'attack',target:provinceId,progress:0,counter:{target:null,progress:0},lastBattle:null,alerts:{},baseline:Object.fromEntries([...ownedProvinces(state,catalog,player),...ownedProvinces(state,catalog,enemy)].map(p=>[p.id,provinceOwner(state,p)]))};
  if(provinceId)for(const old of data.wars){old.target=null;old.progress=0;}
  data.wars.push(war);data.activeId=war.id;data.revision++;
  const b=balance.war,groups=Object.values(catalog.relationGroups??{}).filter(g=>g.includes(enemy));
  for(const country of catalog.countries){if(country.id===player)continue;const key=[player,country.id].sort().join(':');const penalty=country.id===enemy?b.enemyRelationPenalty:b.globalRelationPenalty+(groups.some(g=>g.includes(country.id))?b.allyRelationPenalty:0);data.relations[key]=clamp((data.relations[key]??0)-penalty,-200,200);}
  state.countries[player].reputation=clamp(state.countries[player].reputation-b.reputationPenalty,0,100);
  addNews(state,{id:`war-start:${war.id}`,icon:'⚔️',text:`ประกาศสงครามกับ${catalog.byId.get(enemy).nameTh}`});return war;
}
export function selectWarTarget(state,catalog,balance,warId,provinceId){
  const data=state.warfare,war=data?.wars.find(w=>w.id===warId);if(!war||ended(state)||!warTargets(state,catalog,state.playerCountryId,war.enemy,balance).some(t=>t.province.id===provinceId))return false;
  for(const w of data.wars)if(w.id!==warId){w.target=null;w.progress=0;}
  if(war.target!==provinceId)war.progress=0;war.target=provinceId;data.activeId=war.id;data.revision++;return true;
}
export function setWarStance(state,warId,stance){
  const war=state.warfare?.wars.find(w=>w.id===warId);if(!war||ended(state)||!['attack','defend'].includes(stance))return false;
  war.stance=stance;state.warfare.revision++;return true;
}
export function setDisputeObjective(state,catalog,balance,war,provinceId){
  if(!warTargets(state,catalog,war.enemy,state.playerCountryId,balance).some(t=>t.province.id===provinceId))return false;
  for(const w of state.warfare.wars){w.target=null;w.progress=0;}
  war.target=provinceId;war.stance='defend';state.warfare.activeId=war.id;state.warfare.revision++;return true;
}
export function warTraitPower(state,catalog,id,balance,unit){
  const m=traitModifiers(state,catalog,id),b=balance.war,average=values=>values.reduce((a,v)=>a+v,0)/Math.max(1,values.length);
  const supply=average(['oil','gas','food'].map(r=>m.resourceOutput[r]??1));
  const sale=average(Object.values(m.salePrice).length?Object.values(m.salePrice):[1]);
  const cost=(m.productionCost.all??1)*(m.productionCost[b.traitRecipes[unit]]??1);
  return clamp((1+(m.taxIncome-1)*b.traitTaxWeight)*(1+(supply-1)*b.traitSupplyWeight)*(1+(sale-1)*b.traitSaleWeight)*Math.pow(cost,-b.traitProductionWeight),b.traitMinimum,b.traitMaximum);
}
function commitments(state,id){return id===state.playerCountryId?Math.max(1,state.warfare?.wars.length??1):1;}
export function combatPower(state,catalog,balance,id,province,{defending=false,stance='attack',via='land',share=1,units=null}={}){
  const b=balance.war,army=units??state.countries[id].units;
  let power=keys.reduce((n,key)=>n+(key==='ships'&&!province.coastal?0:(army?.[key]??0)*b.weights[key]*warTraitPower(state,catalog,id,balance,key)),0)*share/commitments(state,id);
  if(!defending&&via==='sea')power*=b.navalAttackMultiplier;
  if(defending){const terrain=province.terrain==='cold'&&!b.winterMonths.includes(state.date.month)?0:b.terrainDefense[province.terrain]??0;
    power*=1+terrain;power*=Math.min(b.garrisonMaximum,b.garrisonBase+province.share*b.garrisonPerShare);
    if(stance==='defend')power*=b.defenseStanceMultiplier;
    if(occupationFactor(state,province.id,id)<1)power*=b.occupiedDefenseMultiplier;
  }
  return power;
}
export const captureChange=(attack,defense,b)=>attack<=0?b.captureMinimum:clamp(b.captureBase+(attack-defense)/Math.max(attack,defense,1)*b.captureAdvantage,b.captureMinimum,b.captureMaximum);
export function battlePreview(state,catalog,balance,war){
  const p=catalog.territoryById.get(war.target);if(!p)return null;
  const player=state.playerCountryId,enemy=war.enemy,holding=provinceOwner(state,p)===player;
  const via=warTargets(state,catalog,holding?enemy:player,holding?player:enemy,balance).find(t=>t.province.id===p.id)?.via??'land';
  const attacker=holding?enemy:player,defender=holding?player:enemy;
  const attack=combatPower(state,catalog,balance,attacker,p,{via,share:balance.war.attackCommitment});
  const defense=combatPower(state,catalog,balance,defender,p,{defending:true,stance:holding?war.stance:'defend',share:balance.war.attackCommitment});
  return {province:p,holding,attack,defense,change:holding||war.stance==='defend'?-balance.war.defenseProgressDecay:captureChange(attack,defense,balance.war),via};
}
function charge(stats,amount){const shortage=Math.max(0,amount-stats.treasury);stats.treasury=Math.max(0,stats.treasury-amount);if(stats.gdp>0)stats.debt+=shortage/stats.gdp*100;return shortage;}
export function warMonthlyCost(stats,months,balance){const b=balance.war;return (stats.gdp*b.monthlyCostGDP+b.monthlyCostMillions/1000+keys.reduce((n,k)=>n+(stats.units?.[k]??0)*b.unitCost[k],0))*(1+(months-1)*b.costEscalation);}
function casualties(state,id,enemyPower,ownPower,province,balance,share,stance='attack'){
  const b=balance.war,stats=state.countries[id],rate=(b.lossBase+b.lossDisadvantage*Math.max(0,(enemyPower-ownPower)/Math.max(enemyPower,ownPower,1)))*(stance==='defend'?b.defensiveLossMultiplier:1);
  const result={tanks:0,aircraft:0,ships:0};
  for(const key of keys){if(key==='ships'&&!province.coastal)continue;const count=stats.units?.[key]??0;result[key]=count?Math.min(count,Math.max(b.minimumUnitLoss,Math.round(count*rate*share/commitments(state,id)))):0;if(stats.units)stats.units[key]-=result[key];}
  return result;
}
function capture(state,catalog,balance,war,province,owner,month){
  const previous=provinceOwner(state,province);if(previous===owner)return;
  transferProvince(state,catalog,province.id,owner);
  const data=state.warfare,b=balance.war;
  if(province.owner===owner)delete data.occupations[province.id];else data.occupations[province.id]={owner,previousOwner:previous,untilMonth:month+b.occupationMonths,factor:b.occupationShare,blockedUntil:0,resistanceFactor:b.resistanceFactor};
  addNews(state,{id:`capture:${war.id}:${province.id}:${owner}:${month}`,icon:owner===state.playerCountryId?'🚩':'⚠️',provinceId:province.id,text:owner===state.playerCountryId?`ยึด${province.nameTh}ได้แล้ว`:`เสียจังหวัด${province.nameTh}`});
}
function addLoss(target,loss){for(const key of keys)target[key]=(target[key]??0)+loss[key];}
function negotiationNotices(state,catalog,balance,war,month){
  for(const id of [state.playerCountryId,war.enemy]){
    const rows=catalog.territoryData.countries[id],share=rows.filter(p=>provinceOwner(state,p)===id).reduce((n,p)=>n+p.share,0),capital=balance.war.capitals[id];
    const capitalProvince=capital&&catalog.territoryById.get(capital),lostCapital=capitalProvince&&provinceOwner(state,capitalProvince)!==id;
    const reason=lostCapital?'capital':share<balance.war.negotiationShare?'territory':null;
    if(!reason||war.alerts[id]===reason)continue;war.alerts[id]=reason;
    const text=`${catalog.byId.get(id).nameTh}${reason==='capital'?'เสียพื้นที่เมืองหลวง':`เหลือดินแดนเดิมต่ำกว่า ${balance.war.negotiationShare}%`} ควรเข้าสู่การเจรจา`;
    state.warfare.notices.push({id:`negotiate:${war.id}:${id}:${reason}`,text,warId:war.id,month});state.warfare.notices=state.warfare.notices.slice(-20);addNews(state,{id:`negotiate:${war.id}:${id}:${reason}`,icon:'🕊️',text});
  }
}
export function processWarMonth(state,catalog,balance,random=Math.random){
  const data=state.warfare,b=balance.war,month=territoryMonth(state),costs={},borrowed={};
  if(!data||!b||ended(state)||data.lastMonth===month)return {costs,borrowed};data.lastMonth=month;
  for(const [id,o]of Object.entries(data.occupations)){
    const p=catalog.territoryById.get(id);
    if(!p||provinceOwner(state,p)!==o.owner||o.untilMonth<=month){delete data.occupations[id];continue;}
    if(random()<b.resistanceChance){o.blockedUntil=month+1;const stats=state.countries[o.owner];stats.happiness=clamp(stats.happiness-b.resistanceHappiness,0,100);for(const key of ['tanks','aircraft'])if(stats.units?.[key])stats.units[key]=Math.max(0,stats.units[key]-Math.max(b.minimumUnitLoss,Math.round(stats.units[key]*b.resistanceUnitLoss)));addNews(state,{id:`resistance:${id}:${month}`,icon:'📣',provinceId:id,text:`เกิดการต่อต้านใน${p.nameTh} รายรับและผลผลิตพื้นที่ลดลงชั่วคราว`});}
  }
  const snapshots=Object.fromEntries(Object.entries(state.countries).map(([id,s])=>[id,{...s.units}]));
  const player=state.playerCountryId;
  for(const war of data.wars){
    war.months++;
    for(const id of [player,war.enemy]){const stats=state.countries[id];
      const cost=warMonthlyCost(stats,war.months,balance);
      borrowed[id]=(borrowed[id]??0)+charge(stats,cost);costs[id]=(costs[id]??0)+cost;stats.happiness=clamp(stats.happiness-Math.min(b.happinessMaximum,b.happinessBase+war.months*b.happinessPerMonth),0,100);
    }
    const targets=warTargets(state,catalog,player,war.enemy,balance),counters=warTargets(state,catalog,war.enemy,player,balance);
    let target=targets.find(t=>t.province.id===war.target),home=war.target&&catalog.territoryById.get(war.target);
    if(!target&&(!home||provinceOwner(state,home)!==player)){war.target=null;war.progress=0;home=null;}
    const counter=counters.find(t=>t.province.id===war.target)??counters.sort((a,c)=>combatPower(state,catalog,balance,player,a.province,{defending:true,stance:war.stance,units:snapshots[player]})-combatPower(state,catalog,balance,player,c.province,{defending:true,stance:war.stance,units:snapshots[player]})||a.province.id.localeCompare(c.province.id))[0];
    if(war.counter.target!==counter?.province.id)war.counter={target:counter?.province.id??null,progress:0};
    const losses={player:{tanks:0,aircraft:0,ships:0},enemy:{tanks:0,aircraft:0,ships:0}};let fought=false;
    if(target&&war.stance==='attack'){
      const p=target.province,attack=combatPower(state,catalog,balance,player,p,{via:target.via,share:b.attackCommitment,units:snapshots[player]}),defense=combatPower(state,catalog,balance,war.enemy,p,{defending:true,stance:'defend',share:b.attackCommitment,units:snapshots[war.enemy]});
      war.progress=clamp(war.progress+captureChange(attack,defense,b),0,100);fought=true;
      addLoss(losses.player,casualties(state,player,defense,attack,p,balance,b.attackCommitment));addLoss(losses.enemy,casualties(state,war.enemy,attack,defense,p,balance,b.attackCommitment,'defend'));
      if(war.progress>=100){capture(state,catalog,balance,war,p,player,month);war.target=null;war.progress=0;}
    }else war.progress=Math.max(0,war.progress-b.defenseProgressDecay);
    if(counter){
      const p=counter.province,attack=combatPower(state,catalog,balance,war.enemy,p,{via:counter.via,share:b.counterCommitment,units:snapshots[war.enemy]}),defense=combatPower(state,catalog,balance,player,p,{defending:true,stance:war.stance,share:b.counterCommitment,units:snapshots[player]});
      war.counter.progress=clamp(war.counter.progress+captureChange(attack,defense,b),0,100);fought=true;
      addLoss(losses.enemy,casualties(state,war.enemy,defense,attack,p,balance,b.counterCommitment));addLoss(losses.player,casualties(state,player,attack,defense,p,balance,b.counterCommitment,war.stance));
      if(war.counter.progress>=100){capture(state,catalog,balance,war,p,war.enemy,month);war.counter={target:null,progress:0};if(war.target===p.id){war.target=null;war.progress=0;}}
    }
    if(!fought)for(const [id,label]of [[player,'player'],[war.enemy,'enemy']])for(const key of ['tanks','aircraft']){const count=state.countries[id].units?.[key]??0,loss=count?Math.max(b.minimumUnitLoss,Math.round(count*b.idleAttrition/commitments(state,id))):0;if(count)state.countries[id].units[key]-=Math.min(count,loss);losses[label][key]=Math.min(count,loss);}
    war.lastBattle={month,losses};negotiationNotices(state,catalog,balance,war,month);
  }
  if(data.wars.length&&state.countries[player].happiness<b.protestHappiness&&(data.lastProtestMonth===null||month-data.lastProtestMonth>=b.protestCooldownMonths)&&!data.protest){data.protest={month};data.lastProtestMonth=month;addNews(state,{id:`antiwar:${month}`,icon:'📣',text:'ประชาชนประท้วงต่อต้านสงคราม'});}
  data.revision++;return {costs,borrowed};
}
export function resolveWarProtest(state,balance,choice){
  const data=state.warfare,stats=state.countries[state.playerCountryId],b=balance.war;if(!data?.protest||!['relief','continue'].includes(choice))return false;
  if(choice==='relief'){const cost=stats.gdp*b.protestCostGDP;if(stats.treasury<cost)return false;stats.treasury-=cost;stats.happiness=clamp(stats.happiness+b.protestReliefHappiness,0,100);}
  else{stats.happiness=clamp(stats.happiness-b.protestRejectHappiness,0,100);stats.reputation=clamp(stats.reputation-b.protestRejectReputation,0,100);}
  data.protest=null;data.revision++;return true;
}
export function warSummary(state,catalog,war){
  let gained=0,lost=0;for(const [id,owner]of Object.entries(war.baseline)){const current=provinceOwner(state,catalog.territoryById.get(id));if(owner===war.enemy&&current===state.playerCountryId)gained++;if(owner===state.playerCountryId&&current===war.enemy)lost++;}
  return {gained,lost};
}
export function warOverlayState(state,catalog,balance){
  return (state.warfare?.wars??[]).map(w=>{
    const targets=warTargets(state,catalog,state.playerCountryId,w.enemy,balance),fronts=targets.map(t=>t.province.id);if(w.counter.target)fronts.push(w.counter.target);
    const target=targets.find(t=>t.province.id===w.target),from=target?target.via==='land'?provinceNeighbors(catalog,w.target).filter(p=>provinceOwner(state,p)===state.playerCountryId):ownedProvinces(state,catalog,state.playerCountryId).filter(p=>p.coastal):[];
    return {id:w.id,fronts,target:w.stance==='attack'?target?.province.id??null:null,from:from.map(p=>p.id)};
  });
}
