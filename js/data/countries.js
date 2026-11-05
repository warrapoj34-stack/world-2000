export const STAT_KEYS = ['gdp', 'population', 'treasury', 'debt', 'military', 'stability', 'happiness', 'tech', 'reputation'];
export const SCORE_KEYS = ['military', 'stability', 'happiness', 'tech', 'reputation'];
export const GOVERNMENTS = {
  democracy: 'ประชาธิปไตย', authoritarian: 'อำนาจนิยม', one_party: 'พรรคเดียว',
  absolute_monarchy: 'สมบูรณาญาสิทธิราชย์', constitutional_monarchy: 'ราชาธิปไตยภายใต้รัฐธรรมนูญ',
};

export function validStats(country) {
  return Boolean(country && STAT_KEYS.every(key => Number.isFinite(country[key]) && country[key] >= 0)
    && SCORE_KEYS.every(key => country[key] <= 100)
    && ['oil', 'food', 'minerals'].every(key => Number.isFinite(country.resources?.[key])
      && country.resources[key] >= 0 && country.resources[key] <= 100));
}

export function createCatalog(countries, relations) {
  if (!Array.isArray(countries) || !countries.length) throw new Error('ไม่มีข้อมูลประเทศ');
  const byId = new Map(), byMapId = new Map();
  for (const country of countries) {
    if (!/^[A-Z]{3}$/.test(country.id) || !validStats(country) || !GOVERNMENTS[country.government]
      || !country.nameTh || !country.nameEn || typeof country.playable !== 'boolean'
      || !country.mapId || byId.has(country.id) || byMapId.has(country.mapId)) {
      throw new Error('ข้อมูลประเทศไม่ถูกต้อง');
    }
    byId.set(country.id, country);
    byMapId.set(country.mapId, country);
  }
  if (relations.default !== 0 || !Array.isArray(relations.pairs)) throw new Error('ข้อมูลการทูตไม่ถูกต้อง');
  const relationPairs = new Map();
  for (const pair of relations.pairs) {
    const key = [pair.a, pair.b].sort().join(':');
    if (!byId.has(pair.a) || !byId.has(pair.b) || pair.a === pair.b
      || !Number.isFinite(pair.value) || Math.abs(pair.value) > 100 || relationPairs.has(key)) {
      throw new Error('ข้อมูลคู่ความสัมพันธ์ไม่ถูกต้อง');
    }
    relationPairs.set(key, pair);
  }
  const playable = countries.filter(country => country.playable);
  if (playable.length < 2) throw new Error('ประเทศสำหรับสุ่มไม่เพียงพอ');
  return { countries, byId, byMapId, playable, relationPairs };
}

let pending;
export async function loadCatalog() {
  if (!pending) pending = Promise.all(['countries_2000.json', 'relations_2000.json'].map(async file => {
    const response = await fetch(new URL(`../../data/${file}`, import.meta.url));
    if (!response.ok) throw new Error(`โหลด ${file} ไม่สำเร็จ`);
    return response.json();
  })).then(([countries, relations]) => createCatalog(countries, relations)).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}
