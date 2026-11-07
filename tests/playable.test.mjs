import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { attachPlayable } from '../js/data/playable.js';
import { createGame, createDraft, rerollDraft, validGame } from '../js/state.js';
import { writeSave, readSave } from '../js/save/storage.js';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url)));
const [countries, relations, ids, regions] = await Promise.all(['countries_2000','relations_2000','playable','playable_regions'].map(read));
test('60 ประเทศเริ่มเกมครบและจัดกลุ่มไม่ซ้ำ ยูโกสลาเวียตรงกับแผนที่', () => {
  const catalog = attachPlayable(createCatalog(countries,relations),ids,regions);
  assert.equal(catalog.newGameCountries.length,60);
  assert.equal(catalog.byId.get('YUG').mapId,'YUG');
  assert.equal(Object.keys(regions).length,5);
  for (let i=0;i<100;i++) {
    const draft=createDraft(catalog); assert(ids.includes(draft.candidateId));
    assert(ids.includes(rerollDraft(draft,catalog).candidateId));
  }
  assert.throws(()=>createGame('QAT',catalog));
  assert(validGame(createGame('USA',catalog),catalog));
});
test('เซฟประเทศนอกรายการยังโหลดได้และ AI ทุกประเทศยังอยู่ครบ', () => {
  const catalog=createCatalog(countries,relations),game=createGame('QAT',catalog);
  let raw; const storage={getItem:()=>raw,setItem:(_,value)=>raw=value};
  assert(writeSave('game',game,catalog,storage).ok);
  const total=catalog.countries.length,ranked=catalog.playable.length;
  attachPlayable(catalog,ids,regions);
  assert.equal(readSave('game',catalog,storage).status,'valid');
  assert.equal(catalog.countries.length,total); assert.equal(catalog.playable.length,ranked);
  assert(writeSave('game',readSave('game',catalog,storage).state,catalog,storage).ok);
});
