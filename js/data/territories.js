import { provinceOwner } from '../territories.js';
export async function loadTerritories(catalog) {
  const response = await fetch(new URL('../../data/provinces/index.json',import.meta.url));
  if (!response.ok) throw new Error('โหลดข้อมูลดินแดนไม่สำเร็จ');
  const data = await response.json(), byId = new Map();
  for (const [owner,rows] of Object.entries(data.countries)) {
    if (!catalog.byId.has(owner) || rows.reduce((n,p)=>n+Math.round(p.share*100),0)!==10000) throw new Error('สัดส่วนดินแดนไม่ครบ');
    for (const p of rows) {
      if (p.owner!==owner || byId.has(p.id) || !p.nameTh || !Number.isFinite(p.share) || p.share<=0 || typeof p.coastal!=='boolean' || !['plain','mountain','forest','cold'].includes(p.terrain) || !p.borders.every(id=>id!==owner&&catalog.byId.has(id))) throw new Error('ข้อมูลดินแดนไม่ถูกต้อง');
      byId.set(p.id,p);
    }
  }
  for(const [id,neighbors]of Object.entries(data.adjacency??{}))if(!byId.has(id)||neighbors.some(other=>!byId.has(other)||byId.get(other).owner===byId.get(id).owner||!data.adjacency[other]?.includes(id)))throw new Error('ข้อมูลจังหวัดชายแดนไม่ถูกต้อง');
  catalog.territoryData=data; catalog.territoryById=byId; catalog.territoryMaps=new Map();
}
export async function loadTerritoryMaps(state,catalog,{opponents=[],includeNeighbors=true}={}) {
  const homes = new Set(catalog.territoryData.files[state.playerCountryId]?[state.playerCountryId]:[]);
  for (const p of catalog.territoryById.values()) if (provinceOwner(state,p)===state.playerCountryId) homes.add(p.owner);
  for(const id of opponents)if(catalog.territoryData.files[id])homes.add(id);
  const required=new Set(homes);
  if(includeNeighbors)for(const p of catalog.territoryById.values()){
    if(provinceOwner(state,p)===state.playerCountryId)for(const id of p.borders)if(catalog.territoryData.files[id])homes.add(id);
    if(p.borders.includes(state.playerCountryId))homes.add(p.owner);
  }
  const requested=[...homes],results = await Promise.allSettled(requested.map(async id=>{
    if (catalog.territoryMaps.has(id)) return [id,catalog.territoryMaps.get(id)];
    const response = await fetch(new URL('../../data/provinces/'+catalog.territoryData.files[id],import.meta.url));
    if (!response.ok) throw new Error('โหลดเส้นดินแดนไม่สำเร็จ กรุณาเชื่อมต่ออินเทอร์เน็ต');
    const data = await response.json();
    if (data.countryId!==id||data.features.length!==catalog.territoryData.countries[id].length||new Set(data.features.map(f=>f.id)).size!==data.features.length||data.features.some(f=>catalog.territoryById.get(f.id)?.owner!==id||!['Polygon','MultiPolygon'].includes(f.geometry?.type))) throw new Error('เส้นดินแดนไม่ครบ');
    return [id,{...data,features:data.features.map(f=>({...f,properties:catalog.territoryById.get(f.id)}))}];
  }));
  const failure=results.find((r,i)=>r.status==='rejected'&&required.has(requested[i]));if(failure)throw failure.reason;
  const maps=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  catalog.territoryMaps=new Map(maps);
  catalog.territoryUnavailable=requested.filter((id,i)=>results[i].status==='rejected');
  catalog.territoryFeatures=maps.flatMap(([,data])=>data.features);
  return catalog.territoryFeatures;
}
