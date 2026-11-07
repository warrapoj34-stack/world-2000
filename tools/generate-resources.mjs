import { readFile, writeFile } from 'node:fs/promises';
import { prepareWorld } from '../js/data/world.js';
import { geoArea, geoCentroid } from '../lib/d3-7.9.0.js';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url)));
const [countries, definitions, overrides, topology, names, settings] = await Promise.all(['countries_2000','resources','resource-overrides-2000','countries-50m','country-names-th','world-2000'].map(read));
const world = prepareWorld(topology, names, settings);
const features = new Map(world.countries.map(feature => [feature.id,feature]));
const landlocked = new Set('AFG AND ARM AUT AZE BLR BTN BOL BWA BFA BDI CAF TCD CZE ETH HUN KAZ KGZ LAO LSO LIE LUX MKD MWI MLI MDA MNG NPL NER PRY RWA SMR SVK SWZ CHE TJK TKM UGA UZB VAT ZMB ZWE'.split(' '));
const rows = countries.map(country => {
  const feature = features.get(country.mapId), area = geoArea(feature) * 6371 ** 2;
  const [lon,lat] = geoCentroid(feature);
  const size = area > 2000000 ? 4 : area > 500000 ? 3 : area > 50000 ? 2 : area > 2000 ? 1 : 0;
  const tropical = Math.abs(lat) < 24;
  const arid = (lon > -20 && lon < 65 && lat > 15 && lat < 40) || ['NAM','BWA','MNG'].includes(country.id);
  const polar = Math.abs(lat) > 65;
  const levels = {oil:0,gas:0,coal:0,iron:Math.max(0,size-1),rare_earths:0,gold:Math.max(0,size-2),
    forest: arid || polar ? 0 : Math.min(4,size+(tropical?1:0)),
    freshwater: arid ? 0 : Math.min(4,size),food:polar?0:Math.max(0,size-(arid?1:0)),
    fish:landlocked.has(country.id)?(size>1?1:0):Math.max(1,Math.min(3,size)),
    uranium:0,biodiversity:polar?1:Math.min(4,size+(tropical?1:0)),copper:Math.max(0,size-2)};
  Object.assign(levels,overrides[country.id]);
  return {id:country.id,levels,basis:overrides[country.id]?'regional_estimate_with_overrides':'regional_estimate',areaKm2:Math.round(area)};
});
if(rows.some(row=>definitions.some(r=>!Number.isInteger(row.levels[r.id])||row.levels[r.id]<0||row.levels[r.id]>5))) throw Error('ระดับทรัพยากรไม่ถูกต้อง');
await writeFile(new URL('../data/country_resources_2000.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(`สร้างข้อมูลทรัพยากร ${rows.length} ประเทศและดินแดน`);
