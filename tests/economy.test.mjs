import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { createGame, validGame } from '../js/state.js';
import { readSave, writeSave } from '../js/save/storage.js';
import { allocateBudget, copyPolicy, validPolicy, fiscalForecast, simulateCountry, ensureEconomy, advanceQuarter, worldRanking, defeatReason } from '../js/economy.js';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url)));
const [balance, countries, relations] = await Promise.all(['balance', 'countries_2000', 'relations_2000'].map(read));
const catalog = createCatalog(countries, relations);
const policy = balance.defaultPolicy;
test('งบรวม 100 แม้หมวดเดียวเต็มหรือทุกหมวดอื่นเป็นศูนย์', () => {
  let p = copyPolicy(policy);
  for (const key of Object.keys(p.budget)) for (const value of [100, 0, 33, 67, 20]) {
    p = allocateBudget(p, key, value); assert(validPolicy(p)); assert.equal(p.budget[key], value);
  }
  assert.deepEqual(policy.budget, {military:20, education:20, health:20, infrastructure:20, welfare:20});
});
test('รายรับเป็นรายไตรมาส เงินหมดจึงกู้ และหนี้คิดใหม่ตาม GDP', () => {
  const stats = {...catalog.byId.get('THA'), gdp:100, treasury:0, debt:100};
  const p = {...copyPolicy(policy), tax:0};
  const f = fiscalForecast(stats, 'democracy', p, balance);
  assert.equal(f.revenue, 0); assert.equal(f.spending, 6.5625); assert.equal(f.interest, 1);
  const result = simulateCountry(stats, 'democracy', p, balance, () => .5);
  assert.equal(result.stats.treasury, 0); assert.equal(result.fiscal.borrowed, 7.5625);
  assert(Math.abs(result.stats.debt * result.stats.gdp / 100 - 107.5625) < 1e-10);
  const rich = simulateCountry({...stats, treasury:20}, 'democracy', p, balance, () => .5);
  assert.equal(rich.fiscal.borrowed, 0); assert.equal(rich.stats.treasury, 12.4375);
});
test('ภาษีและระบอบส่งผลจริง การลงทุนเพิ่มเทคโนโลยีและ GDP', () => {
  const s = catalog.byId.get('THA');
  const simulate = (p, gov = 'democracy') => simulateCountry(s, gov, p, balance, () => .5);
  assert(simulate({...policy,tax:10}).stats.happiness > simulate({...policy,tax:50}).stats.happiness);
  assert(simulate(policy).stats.gdp > simulate(policy, 'authoritarian').stats.gdp);
  assert(simulate(policy).fiscal.spending > simulate(policy, 'authoritarian').fiscal.spending);
  assert(simulate(allocateBudget(policy,'education',80)).stats.tech > simulate(allocateBudget(policy,'education',0)).stats.tech);
  assert(simulate(allocateBudget(policy,'infrastructure',80)).stats.gdp > simulate(allocateBudget(policy,'infrastructure',0)).stats.gdp);
});
test('หนึ่งเทิร์นสามเดือน ครบสี่เทิร์นขึ้นปี AI โตและอันดับเรียงใหม่', () => {
  const game = createGame('THA',catalog), old = game.countries.USA.gdp;
  for(let i=0;i<4;i++) advanceQuarter(game,catalog,balance,()=>.5);
  assert.deepEqual(game.date,{year:2001,month:1}); assert.equal(game.economy.turns,4);
  assert(game.countries.USA.gdp > old); assert(validGame(game,catalog));
  const ranks = worldRanking(game,catalog); assert.equal(ranks.length,191);
  assert(ranks.every((r,i) => i===0 || ranks[i-1].gdp>=r.gdp));
});
test('หนี้เกิน 200 หรือเสถียรภาพศูนย์แพ้และหยุดเทิร์น', () => {
  assert.equal(defeatReason({debt:200,stability:1},balance),null);
  for (const [stats,reason] of [[{debt:201},'bankruptcy'],[{stability:0},'collapse']]) {
    const game = createGame('THA',catalog); Object.assign(game.countries.THA,stats);
    advanceQuarter(game,catalog,balance); assert.equal(game.economy.gameOver,reason);
    const snapshot=JSON.stringify(game); advanceQuarter(game,catalog,balance); assert.equal(JSON.stringify(game),snapshot);
  }
  const game=createGame('THA',catalog); Object.assign(game.countries.THA,{debt:199.9,treasury:0});
  ensureEconomy(game,balance).policy.tax=0; advanceQuarter(game,catalog,balance,()=>0);
  assert.equal(game.economy.gameOver,'bankruptcy');
});
test('เซฟเก่ารับนโยบายตั้งต้น เซฟใหม่คืนค่าเทิร์น นโยบาย รายงาน และสถานะแพ้', () => {
  let raw; const storage={getItem:()=>raw??null,setItem:(_,value)=>raw=value};
  const game=createGame('THA',catalog); writeSave('game',game,catalog,storage);
  const loaded=readSave('game',catalog,storage).state; ensureEconomy(loaded,balance);
  loaded.economy.policy.tax=32; advanceQuarter(loaded,catalog,balance,()=>.5);
  assert(writeSave('game',loaded,catalog,storage).ok);
  assert.deepEqual(readSave('game',catalog,storage).state,loaded);
  loaded.economy.policy.budget.military=100; assert(!validGame(loaded,catalog));
});
test('จำลอง 80 ไตรมาสทุกประเทศ ไม่มี NaN หรือคะแนนเกินขอบเขต', () => {
  const game=createGame('USA',catalog);
  for(let i=0;i<80 && !game.economy?.gameOver;i++) advanceQuarter(game,catalog,balance,()=>i%2);
  assert(validGame(game,catalog));
});
