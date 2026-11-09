export const territoryMonth = state => state.date.year * 12 + state.date.month - 1;
export const provinceOwner = (state, province) => state.territories?.owners[province.id] ?? province.owner;
export function ensureTerritories(state) {
  delete state.provinces;
  return state.territories ??= { version: 1, owners: {}, populationBase: {}, revision: 0 };
}
export function validTerritories(value, catalog) {
  if (value === undefined) return true;
  return Boolean(value && value.version === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0
    && value.owners && Object.entries(value.owners).every(([id, owner]) => catalog.byId.has(owner) && (!catalog.territoryById || catalog.territoryById.has(id)))
    && value.populationBase && Object.entries(value.populationBase).every(([id,n]) => catalog.byId.has(id) && Number.isFinite(n) && n >= 0));
}
export function territoryUnits(catalog,countryId){
  if(catalog.territoryData?.countries[countryId])return catalog.territoryData.countries[countryId];
  const country=catalog.byId.get(countryId);if(!country)return [];
  return [{id:`COUNTRY:${countryId}`,nameTh:country.nameTh,owner:countryId,share:100,resourceId:null,borders:[],coastal:null,terrain:null,capturable:false}];
}
export const isTerritoryCapturable=(catalog,id)=>Boolean(catalog.territoryById?.has(id));
export const crossBorderProvinces=(catalog,id)=>(catalog.territoryData?.adjacency?.[id]??[]).map(id=>catalog.territoryById.get(id));
export function territorySummary(state, catalog, countryId = state.playerCountryId) {
  const home = territoryUnits(catalog,countryId);
  const held = home.filter(p => provinceOwner(state,p) === countryId);
  const additions = [...(catalog.territoryById?.values() ?? [])].filter(p => p.owner !== countryId && provinceOwner(state,p) === countryId);
  const addedShare=additions.reduce((n,p)=>n+Math.round(p.share*100),0),denominator=(home.length?10000:0)+addedShare;
  return { held: held.length + additions.length, total: home.length + additions.length, percent: denominator?(held.reduce((n,p)=>n+Math.round(p.share*100),0)+addedShare)/denominator*100:0, acquired:additions.length,wholeCountry:!catalog.territoryData?.countries[countryId] };
}
export function territorySources(state, catalog, countryId) {
  const result = new Map([[countryId, catalog.territoryData?.countries[countryId] ? 0 : 1]]);
  for (const p of catalog.territoryById?.values() ?? []) if (provinceOwner(state,p) === countryId) result.set(p.owner,(result.get(p.owner) ?? 0) + p.share / 100);
  return result;
}
export function territoryIncomeMultiplier(state,catalog,countryId) {
  const ownGDP = state.countries[countryId].gdp;
  if (!ownGDP) return 0;
  return [...territorySources(state,catalog,countryId)].reduce((n,[source,share]) => n + state.countries[source].gdp * share,0) / ownGDP;
}
export function transferProvince(state,catalog,provinceId,newOwner) {
  const province = catalog.territoryById?.get(provinceId);
  if (!province || !catalog.byId.has(newOwner)) throw new Error('ไม่พบดินแดนหรือประเทศผู้ครอง');
  const data = ensureTerritories(state), previous = provinceOwner(state,province);
  if (previous === newOwner) return false;
  for (const id of [province.owner,previous,newOwner]) data.populationBase[id] ??= state.countries[id].population;
  if (newOwner === province.owner) delete data.owners[provinceId]; else data.owners[provinceId] = newOwner;
  data.revision++;
  const populations=Object.fromEntries(Object.keys(data.populationBase).map(id=>[id,0]));
  for(const [source,base]of Object.entries(data.populationBase)){
    const owners=new Map();
    if(!catalog.territoryData.countries[source])owners.set(source,1);
    else for(const p of catalog.territoryData.countries[source]){const owner=provinceOwner(state,p);owners.set(owner,(owners.get(owner)??0)+p.share/100);}
    const people=Math.round(base*1e6),allocated=[...owners].map(([owner,share])=>({owner,exact:people*share,people:Math.floor(people*share+1e-7)}));
    const remaining=people-allocated.reduce((n,a)=>n+a.people,0);
    allocated.sort((a,b)=>(b.exact-b.people)-(a.exact-a.people)||a.owner.localeCompare(b.owner));
    for(let i=0;i<remaining;i++)allocated[i].people++;
    for(const a of allocated)populations[a.owner]=(populations[a.owner]??0)+a.people;
  }
  for(const [id,people]of Object.entries(populations))state.countries[id].population=people/1e6;
  if (state.provinceEvents?.pending?.provinceId === provinceId && newOwner !== state.playerCountryId) state.provinceEvents.pending = null;
  if (state.provinceEvents?.unrest) delete state.provinceEvents.unrest[provinceId];
  return true;
}
export const createTerritoryController = (state,catalog) => ({ transferProvince:(id,owner) => transferProvince(state,catalog,id,owner) });

// แจกผลผลิตเป็นจำนวนเต็มโดยไม่สร้างทรัพยากรเพิ่มจากการปัดเศษ
export function distributeTerritoryProduction(state,catalog,base) {
  const output = Object.fromEntries(Object.keys(base).map(id=>[id,Object.fromEntries(Object.keys(base[id]).map(r=>[r,0]))]));
  const month = territoryMonth(state);
  for (const [source,production] of Object.entries(base)) {
    const rows = catalog.territoryData?.countries[source];
    const owners = new Map();
    if (!rows) owners.set(source,1);
    else for (const p of rows) {
      const factor = (state.provinceEvents?.effects ?? []).filter(e=>e.provinceId===p.id && e.untilMonth>month).reduce((n,e)=>n*e.production,1);
      const owner = provinceOwner(state,p); owners.set(owner,(owners.get(owner)??0)+p.share/100*factor);
    }
    const totalShare = [...owners.values()].reduce((a,b)=>a+b,0);
    for (const [resource,amount] of Object.entries(production)) {
      const allocated = [...owners].map(([owner,share])=>({owner,exact:amount*share,units:Math.floor(amount*share+1e-9)}));
      const remaining = Math.round(amount*totalShare) - allocated.reduce((n,a)=>n+a.units,0);
      allocated.sort((a,b)=>(b.exact-b.units)-(a.exact-a.units)||a.owner.localeCompare(b.owner));
      for (let i=0;i<remaining;i++) allocated[i].units++;
      for (const a of allocated) output[a.owner][resource] += a.units;
    }
  }
  return output;
}
