import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog, validStats } from '../js/data/countries.js';
import { createGame, createDraft, rerollDraft, validGame, chooseCountry } from '../js/state.js';
import { readSave, writeSave, SAVE_KEYS } from '../js/save/storage.js';
import { getRelation } from '../js/diplomacy/relations.js';
import { prepareWorld } from '../js/data/world.js';
import { formatNumber, formatPopulation } from '../js/ui/stats.js';
import { VERSION } from '../js/version.js';

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [countries, relations, topology, names, settings] = await Promise.all([
  read('countries_2000.json'), read('relations_2000.json'), read('countries-50m.json'),
  read('country-names-th.json'), read('world-2000.json'),
]);
const catalog = createCatalog(countries, relations);
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('แสดงสถิติประเทศจิ๋วโดยไม่ปัดประชากรเป็นศูนย์', () => {
  assert.equal(formatPopulation(0.0008), '800 คน');
  assert.equal(formatNumber(0.001), '0');
});

test('ข้อมูลครบทุกพื้นที่บนแผนที่และใช้รหัสสามตัวไม่ซ้ำ', () => {
  const world = prepareWorld(topology, names, settings);
  assert.equal(countries.length, world.countries.length);
  assert(world.countries.every(country => catalog.byMapId.has(country.id)));
  assert.equal(catalog.playable.length, 191);
  assert.equal(catalog.byId.get('YUG').mapId, 'YUG');
  assert.equal(catalog.byId.get('SDN').mapId, '729');
  assert(countries.every(validStats));
  assert(countries.filter(country => country.idType === 'custom').every(country => !country.playable));
});

test('สัดส่วนเศรษฐกิจ ประชากร และกำลังทหารสอดคล้องสถานการณ์', () => {
  const get = id => catalog.byId.get(id);
  assert.equal([...countries].sort((a,b) => b.gdp - a.gdp)[0].id, 'USA');
  assert.equal([...countries].sort((a,b) => b.population - a.population)[0].id, 'CHN');
  assert(get('USA').gdp > 10000 && get('USA').gdp < 11000);
  assert(get('CHN').population > 1200 && get('CHN').population < 1300);
  assert(get('PRK').gdp < get('KOR').gdp / 10);
  assert(get('PRK').military >= 75);
  assert.equal(get('THA').government, 'constitutional_monarchy');
  assert.equal(get('CHN').government, 'one_party');
  assert.equal(get('TLS').playable, false);
  assert.equal(get('ATA').population, 0);
});

test('ความสัมพันธ์สมมาตร มีคู่สำคัญและคู่อื่นเป็นศูนย์', () => {
  assert.equal(getRelation(catalog, 'USA', 'PRK').value, -90);
  assert.equal(getRelation(catalog, 'PRK', 'USA').value, -90);
  assert.equal(getRelation(catalog, 'IND', 'PAK').value, -90);
  assert.equal(getRelation(catalog, 'CHN', 'TWN').value, -80);
  assert.equal(getRelation(catalog, 'THA', 'LAO').value, 40);
  assert.equal(getRelation(catalog, 'USA', 'DEU').value, 65);
  assert.equal(getRelation(catalog, 'GRC', 'TUR').value, -35);
  assert.equal(getRelation(catalog, 'CAN', 'LAO').value, 0);
  assert.equal(relations.groups.NATO.length, 19);
  assert.equal(relations.groups.ASEAN.length, 10);
  assert(!relations.groups.NATO.includes('LVA'));
});

test('สุ่มใหม่ได้สามครั้ง ไม่ได้ประเทศเดิมและไม่สุ่มดินแดน', () => {
  let draft = createDraft(catalog);
  for (let count = 2; count >= 0; count--) {
    const old = draft.candidateId;
    draft = rerollDraft(draft, catalog, () => 0.5);
    assert.equal(draft.rerollsRemaining, count);
    assert.notEqual(draft.candidateId, old);
    assert(catalog.byId.get(draft.candidateId).playable);
  }
  assert.equal(rerollDraft(draft, catalog), draft);
  assert(catalog.byId.get(chooseCountry(catalog, null, () => 0)).playable);
  assert(catalog.byId.get(chooseCountry(catalog, null, () => 1)).playable);
});

test('เซฟคืนค่าสถิติ วันที่ และมุมกล้องโดยไม่แก้ข้อมูลตั้งต้น', () => {
  const storage = memory();
  const game = createGame('THA', catalog);
  game.countries.THA.treasury = 321.25;
  game.date.month = 2;
  game.selectedCountryId = 'USA';
  game.view = { zoom: 4, center: [900,450] };
  assert(writeSave('game', game, catalog, storage).ok);
  assert.deepEqual(readSave('game', catalog, storage).state, game);
  assert.notEqual(catalog.byId.get('THA').treasury, 321.25);
  const record = JSON.parse(storage.getItem(SAVE_KEYS.game));
  assert.equal(record.saveVersion, 1);
  assert.equal(record.gameVersion, VERSION);
});

test('ฉบับร่างไม่ทับเซฟเดิมและจำจำนวนครั้งสุ่ม', () => {
  const storage = memory();
  const game = createGame('USA', catalog);
  writeSave('game', game, catalog, storage);
  let draft = createDraft(catalog);
  draft = rerollDraft(draft, catalog);
  writeSave('draft', draft, catalog, storage);
  assert.equal(readSave('draft', catalog, storage).state.rerollsRemaining, 2);
  assert.equal(readSave('game', catalog, storage).state.playerCountryId, 'USA');
});

test('เซฟเสียและเซฟรุ่นอนาคตไม่ถูกลบหรือโหลดผิด', () => {
  const storage = memory();
  storage.setItem(SAVE_KEYS.game, '{broken');
  assert.equal(readSave('game', catalog, storage).status, 'corrupt');
  assert.equal(storage.getItem(SAVE_KEYS.game), '{broken');
  storage.setItem(SAVE_KEYS.game, JSON.stringify({saveVersion:99, state:{}}));
  assert.equal(readSave('game', catalog, storage).status, 'incompatible');
  const game = createGame('USA', catalog);
  game.countries.USA.happiness = 101;
  assert.equal(validGame(game, catalog), false);
  assert.equal(writeSave('game', game, catalog, storage).ok, false);
});

test('จัดการ storage ถูกปิดหรือพื้นที่เต็มโดยไม่อ้างว่าบันทึกสำเร็จ', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.equal(readSave('game', catalog, blocked).status, 'unavailable');
  assert.equal(writeSave('game', createGame('THA', catalog), catalog, blocked).ok, false);
});
