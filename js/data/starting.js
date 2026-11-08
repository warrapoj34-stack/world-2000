import { simulateCountry } from '../economy.js';
import { traitModifiers } from '../traits.js';
import { militaryValue } from '../war/military.js';
export function startingOutlook(country,catalog,balance){
  const state={playerCountryId:country.id,date:{year:2000,month:1,day:1}};
  const policy={tax:25,budget:{...(catalog.policies?.budget.find(c=>c.id==='balanced').budget??balance.defaultPolicy.budget)}};
  const fiscal=simulateCountry(country,country.government,policy,balance,()=>.5,null,{revenue:traitModifiers(state,catalog).taxIncome},1).fiscal;
  const units=catalog.militaryInitial.get(country.id),weights=catalog.militaryRules.weights;
  const maximum=Math.max(1,...catalog.newGameCountries.map(c=>militaryValue(catalog.militaryInitial.get(c.id),weights)));
  const weakness=catalog.traits[country.id].weakness.effects.reduce((sum,e)=>sum+Math.abs(e.percent),0);
  const poorer=catalog.newGameCountries.filter(c=>c.treasury<country.treasury).length;
  const wealth=poorer/Math.max(1,catalog.newGameCountries.length-1)*55;
  const score=wealth+Math.sqrt(militaryValue(units,weights)/maximum)*30-Math.min(20,weakness/2);
  return {treasury:country.treasury,fiscal,units,difficulty:score>=50?'ง่าย':score>=23?'กลาง':'ยาก'};
}
