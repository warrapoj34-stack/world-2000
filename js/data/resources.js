import { RESOURCE_IDS } from '../resources.js';
export function attachResources(catalog, definitions, rows) {
  if(!Array.isArray(definitions)||definitions.length!==RESOURCE_IDS.length
    ||new Set(definitions.map(r=>r.id)).size!==RESOURCE_IDS.length
    ||definitions.some(r=>!RESOURCE_IDS.includes(r.id)||!r.nameTh||!r.icon||!r.descriptionTh||!Number.isFinite(r.basePrice)||r.basePrice<0)) throw Error('ชนิดทรัพยากรไม่ถูกต้อง');
  if(!Array.isArray(rows)||rows.length!==catalog.countries.length) throw Error('ข้อมูลทรัพยากรประเทศไม่ครบ');
  const byId=new Map();
  for(const row of rows) {
    if(!catalog.byId.has(row.id)||byId.has(row.id)||RESOURCE_IDS.some(id=>!Number.isInteger(row.levels?.[id])||row.levels[id]<0||row.levels[id]>5)) throw Error('ระดับทรัพยากรไม่ถูกต้อง');
    byId.set(row.id,row.levels);
  }
  catalog.resourceDefinitions=definitions; catalog.resourceLevels=byId;
  return catalog;
}
export async function loadResources(catalog) {
  const [definitions,rows]=await Promise.all(['resources','country_resources_2000'].map(async name=>{
    const response=await fetch(new URL(`../../data/${name}.json`,import.meta.url));
    if(!response.ok)throw Error('โหลดทรัพยากรไม่สำเร็จ');return response.json();
  }));
  return attachResources(catalog,definitions,rows);
}
