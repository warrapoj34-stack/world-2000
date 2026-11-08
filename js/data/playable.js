export function attachPlayable(catalog, ids, regions) {
  if (!Array.isArray(ids) || ids.length !== 40 || new Set(ids).size !== 40
    || ids.some(id => !catalog.byId.get(id)?.playable)) throw new Error('รายการประเทศเริ่มเกมไม่ถูกต้อง');
  const grouped = Object.values(regions).flat();
  if (grouped.length !== 40 || new Set(grouped).size !== 40 || grouped.some(id => !ids.includes(id))) throw new Error('กลุ่มประเทศไม่ครบ');
  catalog.newGameCountries = ids.map(id => catalog.byId.get(id));
  catalog.newGameRegions = regions;
  return catalog;
}

export async function loadPlayable(catalog) {
  const data = await Promise.all(['playable.json', 'playable_regions.json'].map(async file => {
    const response = await fetch(new URL(`../../data/${file}`, import.meta.url));
    if (!response.ok) throw new Error('โหลดรายการประเทศเริ่มเกมไม่สำเร็จ');
    return response.json();
  }));
  return attachPlayable(catalog, ...data);
}
