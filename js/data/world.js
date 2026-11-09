import { feature, merge, neighbors } from '../../lib/topojson-client-3.1.0.js';
import { geoContains } from '../../lib/d3-7.9.0.js';

async function readJSON(file) {
  const response = await fetch(new URL(`../../data/${file}`, import.meta.url));
  if (!response.ok) throw new Error(`ไม่สามารถอ่าน ${file}`);
  return response.json();
}

export async function loadWorld() {
  const [topology, names, settings] = await Promise.all([
    readJSON('countries-50m.json'), readJSON('country-names-th.json'), readJSON('world-2000.json'),
  ]);
  return prepareWorld(topology, names, settings);
}

export function prepareWorld(topology, names, settings) {
  const geometries = topology.objects.countries.geometries;
  const consumed = new Set();
  const owner = new Map();
  const countries = [];

  // รวมเส้นขอบจริง เพื่อตัดพรมแดนภายในกลุ่มออก
  for (const group of settings.merges) {
    const members = group.members.map(name => {
      const geometry = geometries.find(item => item.properties.name === name);
      if (!geometry) throw new Error(`ไม่พบพื้นที่ ${name}`);
      consumed.add(geometry);
      owner.set(geometry, group.id);
      return geometry;
    });
    countries.push({
      type: 'Feature', id: group.id, geometry: merge(topology, members),
      properties: { nameTh: group.nameTh, noteTh: group.noteTh, sourceNames: group.members },
    });
  }

  const remaining = new Map();
  for (const geometry of geometries) {
    if (consumed.has(geometry)) continue;
    const special = settings.specialTerritories[geometry.properties.name];
    const id = special?.id ?? String(geometry.id);
    if (!remaining.has(id)) remaining.set(id, []);
    remaining.get(id).push(geometry);
    owner.set(geometry, id);
  }
  for (const [id, parts] of remaining) {
    const geometry = parts[0];
    const name = geometry.properties.name;
    const special = settings.specialTerritories[name];
    const override = settings.overrides[id] ?? {};
    const nameTh = override.nameTh ?? special?.nameTh ?? names[id];
    if (!nameTh) throw new Error(`ยังไม่มีชื่อภาษาไทยสำหรับ ${name}`);
    // รวมเกาะที่ต้นทางแยกรูปทรงแต่ใช้รหัสประเทศเดียวกัน
    const country = parts.length === 1 ? feature(topology, geometry)
      : { type: 'Feature', geometry: merge(topology, parts) };
    country.id = id;
    country.properties = { nameTh, sourceNames: parts.map(part => part.properties.name), ...override };
    countries.push(country);
  }

  // คืนดินแดนตามปีเริ่มเกม โดยไม่แก้ topology ต้นฉบับ
  for(const transfer of settings.transfers2000??[]){
    const source=geometries.find(g=>String(g.id)===transfer.from),target=geometries.find(g=>String(g.id)===transfer.to);
    if(!source||!target||source.type!=='MultiPolygon')throw new Error('ไม่พบข้อมูลปรับเขตปี 2000');
    const pieces=source.arcs.map(arcs=>({type:'Polygon',arcs}));
    const selected=pieces.filter(p=>geoContains(feature(topology,p),transfer.anchor));
    if(selected.length!==1)throw new Error('ระบุพื้นที่ปรับเขตปี 2000 ไม่ได้');
    countries.find(c=>c.id===transfer.from).geometry=feature(topology,{...source,arcs:source.arcs.filter((_,i)=>pieces[i]!==selected[0])}).geometry;
    countries.find(c=>c.id===transfer.to).geometry=merge(topology,[target,...selected]);
  }
  // เลือกสีโดยหลีกเลี่ยงสีเดียวกับประเทศที่ติดกัน
  const adjacency = new Map(countries.map(country => [country.id, new Set()]));
  neighbors(geometries).forEach((items, index) => {
    const id = owner.get(geometries[index]);
    for (const adjacent of items) {
      const other = owner.get(geometries[adjacent]);
      if (id !== other) adjacency.get(id).add(other);
    }
  });
  const colors = new Map();
  const palette = settings.map.palette;
  [...countries].sort((a, b) => adjacency.get(b.id).size - adjacency.get(a.id).size)
    .forEach((country, index) => {
      const used = new Set([...adjacency.get(country.id)].map(id => colors.get(id)));
      const candidates = palette.map((_, offset) => palette[(index + offset) % palette.length]);
      const color = country.properties.color ?? candidates.find(value => !used.has(value)) ?? candidates[0];
      colors.set(country.id, color);
      country.properties.color = color;
    });
  return { countries, settings };
}
