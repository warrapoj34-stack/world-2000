export function ensurePolicyCards(state, data) {
 const e=state.economy;
 if(!e.cards){e.cards={tax:'medium',budget:'balanced',special:[null,null,null],locks:{}};e.policy={tax:25,budget:{...data.budget.find(c=>c.id==='balanced').budget}};}
 return e.cards;
}
export function policyModifiers(cards,data){
 const result={revenue:1,growth:1,happiness:1,stability:1,military:1,costRate:0};
 for(const id of cards?.special??[]){const c=data.special.find(c=>c.id===id);if(!c)continue;result.costRate+=c.costRate;for(const [key,value] of Object.entries(c.multipliers))result[key]*=value;}
 return result;
}
export function choosePolicy(state,data,government,group,id,slot=0){
 const c=ensurePolicyCards(state,data),key=group==='special'?'slot'+slot:group;
 if(state.economy.gameOver||(c.locks[key]??0)>state.economy.turns)return false;
 if(group==='special'&&(!Number.isInteger(slot)||slot<0||slot>2))return false;
 const card=data[group]?.find(c=>c.id===id);
 if(!card && !(group==='special'&&id===null))return false;
 if(card?.governments&&!card.governments.includes(government))return false;
 if(group==='special'){if(c.special[slot]===id||(id&&c.special.includes(id)))return false;c.special[slot]=id;}
 else {if(c[group]===id)return false;c[group]=id;if(group==='tax')state.economy.policy.tax=card.tax;else state.economy.policy.budget={...card.budget};}
 c.locks[key]=state.economy.turns+data.cooldown;return true;
}
