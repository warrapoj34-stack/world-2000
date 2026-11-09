import { provinceOwner } from '../territories.js';
export async function loadTerritories(catalog) {
  const response = await fetch(new URL('../../data/provinces/index.json',import.meta.url));
  if (!response.ok) throw new Error('โหลดข้อมูลดินแดนไม่สำเร็จ');
  const data = await response.json(), byId = new Map();
  for (const [owner,rows] of Object.entries(data.countries)) {
    if (!catalog.byId.has(owner) || rows.reduce((n,p)=>n+Math.round(p.share*100),0)!==10000) throw new Error('สัดส่วนดินแดนไม่ครบ');
    for (const p of rows) {
      if (p.owner!==owner || byId.has(p.id) || !p.nameTh || !Number.isFinite(p.share) || p.share<=0 || !p.borders.every(id=>id!==owner&&catalog.byId.has(id))) throw new Error('ข้อมูลดินแดนไม่ถูกต้อง');
      byId.set(p.id,p);
    }
  }
  catalog.territoryData=data; catalog.territoryById=byId; catalog.territoryMaps=new Map();
}
export async function loadTerritoryMaps(state,catalog) {
  const homes = new Set(catalog.territoryData.files[state.playerCountryId]?[state.playerCountryId]:[]);
  for (const p of catalog.territoryById.values()) if (provinceOwner(state,p)===state.playerCountryId) homes.add(p.owner);
  const maps = await Promise.all([...homes].map(async id=>{
    if (catalog.territoryMaps.has(id)) return [id,catalog.territoryMaps.get(id)];
    const response = await fetch(new URL('../../data/provinces/'+catalog.territoryData.files[id],import.meta.url));
    if (!response.ok) throw new Error('โหลดเส้นดินแดนไม่สำเร็จ กรุณาเชื่อมต่ออินเทอร์เน็ต');
    const data = await response.json();
    if (data.features.length!==catalog.territoryData.countries[id].length) throw new Error('เส้นดินแดนไม่ครบ');
    return [id,{...data,features:data.features.map(f=>({...f,properties:catalog.territoryById.get(f.id)}))}];
  }));
  catalog.territoryMaps=new Map(maps);
  catalog.territoryFeatures=maps.flatMap(([,data])=>data.features).filter(f=>f.properties.owner===state.playerCountryId||provinceOwner(state,f.properties)===state.playerCountryId);
  return catalog.territoryFeatures;
}
