import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { attachResources } from '../js/data/resources.js';
import { attachMilitary, ensureMilitary } from '../js/war/military.js';
import { enqueueProduction } from '../js/war/production.js';
import { createGame, validGame } from '../js/state.js';
import { ensureEconomy, advanceMonth } from '../js/economy.js';
import { RESOURCE_IDS, ensureResources, resourceProduction, sellResource, processAutoExports } from '../js/resources.js';
import { ensureMarket, advanceMarketMonth, marketPriceMillions, marketHistory, setExportSetting, exportCapacity, validMarket } from '../js/market.js';
import { addMarketEffects, marketDay, marketEffectMultiplier, validMarketEffects } from '../js/market-effects.js';
import { drawEvent, chooseEvent } from '../js/events/engine.js';
import { activateTrait } from '../js/traits.js';
import { monthIndex, takeMonthlyExports } from '../js/map/trade-data.js';
import { readSave, writeSave, SAVE_KEYS } from '../js/save/storage.js';

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const [countries, relations, definitions, levels, military, rules, recipes, traits, playable, balance] = await Promise.all(
  ['countries_2000', 'relations_2000', 'resources', 'country_resources_2000', 'military2000', 'military_rules', 'recipes', 'traits', 'playable', 'balance'].map(read));
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

function setup(id = 'AUS', cargoShips = 1) {
  const catalog = createCatalog(countries, relations);
  catalog.newGameCountries = playable.map(key => catalog.byId.get(key));
  attachResources(catalog, definitions, levels);
  attachMilitary(catalog, military, rules);
  catalog.recipes = recipes;
  const state = createGame(id, catalog);
  ensureEconomy(state, balance); ensureResources(state); ensureMilitary(state, catalog); ensureMarket(state, balance);
  state.date.day = 1;
  state.countries[id].units.cargoShips = cargoShips;
  return { state, catalog };
}
function allExports(state, share = 1) {
  for (const id of RESOURCE_IDS) assert(setExportSetting(state, id, { enabled: true, share }, balance));
}
function allStars(catalog, id, stars = 5) {
  catalog.resourceLevels.set(id, Object.fromEntries(RESOURCE_IDS.map(key => [key, stars])));
}
function moveDateOneMonth(state) {
  state.date.month++;
  if (state.date.month > 12) { state.date.month = 1; state.date.year++; }
  state.date.day = 1;
}

test('ราคาขึ้นและลงไม่เกิน 5% ต่อเดือน การเปิดตลาดซ้ำไม่เดินราคา', () => {
  const { state } = setup();
  const initial = structuredClone(state.market);
  for (const id of RESOURCE_IDS) near(marketPriceMillions(state, id, balance), balance.resources.salePricesMillions[id]);
  ensureMarket(state, balance);
  marketHistory(state, 'oil', balance);
  assert.deepEqual(state.market, initial);
  let rolls = 0;
  advanceMarketMonth(state, balance, () => { rolls++; return 1; });
  assert.equal(rolls, RESOURCE_IDS.length);
  for (const id of RESOURCE_IDS) near(state.market.prices[id], 1.05);
  const raised = structuredClone(state.market);
  advanceMarketMonth(state, balance, () => { throw new Error('ห้ามสุ่มเดือนเดิมซ้ำ'); });
  assert.deepEqual(state.market, raised);
  moveDateOneMonth(state);
  advanceMarketMonth(state, balance, () => 0);
  for (const id of RESOURCE_IDS) near(state.market.prices[id], 1.05 * .95);
  assert.equal(state.countries.AUS.treasury, countries.find(c => c.id === 'AUS').treasury);
});

test('ราคามีขอบเขต 50–200% และกราฟเก็บเพียง 12 เดือนต่อเนื่อง', () => {
  const { state } = setup();
  for (const roll of [1, 0]) {
    for (let month = 0; month < 48; month++) {
      advanceMarketMonth(state, balance, () => roll); moveDateOneMonth(state);
      for (const id of RESOURCE_IDS) assert(state.market.prices[id] >= .5 && state.market.prices[id] <= 2);
    }
    for (const id of RESOURCE_IDS) {
      near(state.market.prices[id], roll ? 2 : .5);
      const history = marketHistory(state, id, balance);
      assert.equal(history.length, 12);
      assert.equal(history.at(-1).month, monthIndex(state));
      assert(history.every((point, i) => !i || point.month === history[i - 1].month + 1));
      history[0].priceMillions = -1;
      assert(state.market.history[id][0].priceMillions >= 0);
    }
  }
  assert(validMarket(state.market));
});

test('ราคาชั่วคราวหมดอายุตรงวันในเกม และไม่ผลักราคาพ้นขอบเขต', () => {
  const { state } = setup();
  addMarketEffects(state, [{ resourceId: 'oil', percent: 20, durationDays: 10 }], 'event:test');
  near(marketPriceMillions(state, 'oil', balance), 3.6);
  addMarketEffects(state, [{ resourceId: 'oil', percent: 10, durationDays: 10 }], 'event:test');
  assert.equal(state.marketEffects.length, 1);
  near(marketEffectMultiplier(state, 'oil'), 1.1);
  state.date.day = 10; near(marketEffectMultiplier(state, 'oil'), 1.1);
  state.date.day = 11; near(marketEffectMultiplier(state, 'oil'), 1);
  state.market.prices.oil = 2;
  addMarketEffects(state, [{ resourceId: 'oil', percent: 100 }], 'special:test');
  near(marketPriceMillions(state, 'oil', balance), 6);
  state.market.prices.oil = .5;
  addMarketEffects(state, [{ resourceId: 'oil', percent: -90 }], 'special:test');
  near(marketPriceMillions(state, 'oil', balance), 1.5);
  assert(validMarketEffects(state.marketEffects));
});

test('เหตุการณ์ ตัวเลือก และความสามารถพิเศษเปลี่ยนราคาจริงตามระยะเวลา', () => {
  const { state, catalog } = setup('SAU');
  catalog.events = [{ id: 'price_test', title: 'ทดสอบราคา', icon: '🛢️', when: {},
    marketEffects: [{ resourceId: 'oil', percent: 20, durationDays: 30 }],
    options: [{ id: 'help', text: 'ช่วยผู้ผลิต', cost: 0, effects: {}, marketEffects: [{ resourceId: 'gas', percent: -10, durationDays: 15 }] }] }];
  assert.equal(drawEvent(state, catalog, () => 0).id, 'price_test');
  near(marketPriceMillions(state, 'oil', balance), 3.6);
  chooseEvent(state, catalog, 'help');
  near(marketPriceMillions(state, 'gas', balance), 1.8);
  const specialCountry = Object.keys(traits).find(id => traits[id].special.marketEffects?.length);
  const special = setup(specialCountry); special.catalog.traits = traits;
  assert(activateTrait(special.state, special.catalog));
  const effect = traits[specialCountry].special.marketEffects[0];
  const base = balance.resources.salePricesMillions[effect.resourceId];
  near(marketPriceMillions(special.state, effect.resourceId, balance), base * (1 + effect.percent / 100));
  const expiry = special.state.traitState[specialCountry].activeUntil;
  const date = new Date(expiry * 86400000);
  special.state.date = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  near(marketPriceMillions(special.state, effect.resourceId, balance), base);
});

test('สัดส่วนส่งออกขายเฉพาะผลผลิตใหม่ ไม่ขายคลังเก่าหรือขายเมื่อปิดสวิตช์', () => {
  for (const [share, sold] of [[0, 0], [.25, 2], [.5, 5], [1, 10]]) {
    const { state, catalog } = setup('AUS', 3);
    allStars(catalog, 'AUS');
    state.countries.AUS.resourceStock.oil = 100;
    setExportSetting(state, 'oil', { enabled: true, share }, balance);
    advanceMonth(state, catalog, balance, () => .5);
    assert.equal(state.market.lastExports.units, sold);
    assert.equal(state.countries.AUS.resourceStock.oil, 110 - sold);
    near(state.market.lastExports.income, sold * 3 / 1000);
    const remaining = state.countries.AUS.resourceStock.oil;
    catalog.resourceLevels.set('AUS', { ...catalog.resourceLevels.get('AUS'), oil: 0 });
    advanceMonth(state, catalog, balance, () => .5);
    assert.equal(state.market.lastExports.units, 0);
    assert.equal(state.countries.AUS.resourceStock.oil, remaining);
  }
  const { state, catalog } = setup(); allStars(catalog, 'AUS');
  setExportSetting(state, 'oil', { enabled: false, share: 1 }, balance);
  advanceMonth(state, catalog, balance, () => .5);
  assert.equal(state.countries.AUS.resourceStock.oil, 10);
  assert.equal(state.market.lastExports.units, 0);
});

test('เรือหนึ่งลำแบ่งกำลังส่งออก 20 หน่วยอย่างทั่วถึง ส่วนเกินเก็บในคลัง', () => {
  const { state, catalog } = setup(); allStars(catalog, 'AUS'); allExports(state);
  assert.deepEqual(exportCapacity(state, catalog, balance), { units: 20, mode: 'sea' });
  advanceMonth(state, catalog, balance, () => .5);
  const result = state.market.lastExports;
  assert.equal(result.units, 20); assert.equal(result.items.length, 13);
  assert(result.items.every(item => item.units >= 1 && item.units <= 2));
  assert.equal(Object.values(state.countries.AUS.resourceStock).reduce((a, b) => a + b, 0), 110);
  for (const item of result.items) assert.equal(state.countries.AUS.resourceStock[item.resourceId], 10 - item.units);
  const withoutShips = setup('AUS', 0); allStars(withoutShips.catalog, 'AUS'); allExports(withoutShips.state);
  advanceMonth(withoutShips.state, withoutShips.catalog, balance, () => .5);
  assert.equal(withoutShips.state.market.lastExports.units, 0);
  assert.equal(withoutShips.state.market.lastExports.income, 0);
  assert(Object.values(withoutShips.state.countries.AUS.resourceStock).every(value => value === 10));
});

test('ประเทศไม่มีชายฝั่งใช้รถไฟ 10 หน่วย ไม่เพิ่มกำลังส่งออกด้วยเรือ', () => {
  const { state, catalog } = setup('KAZ', 99); allStars(catalog, 'KAZ'); allExports(state);
  assert.deepEqual(exportCapacity(state, catalog, balance), { units: 10, mode: 'rail' });
  advanceMonth(state, catalog, balance, () => .5);
  assert.equal(state.market.lastExports.mode, 'rail'); assert.equal(state.market.lastExports.units, 10);
  assert(state.market.lastExports.items.every(item => item.units === 1));
  assert.equal(Object.values(state.countries.KAZ.resourceStock).reduce((a, b) => a + b, 0), 120);
});

test('เงินส่งออกเข้าครั้งเดียว รวมในรายรับสุทธิ และลดเงินกู้เมื่อเงินไม่พอ', () => {
  for (const treasury of [100, .001]) {
    const { state, catalog } = setup(); state.countries.AUS.treasury = treasury;
    const withoutExports = structuredClone(state); allExports(state);
    const originalStats = state.countries.AUS, snapshot = structuredClone(originalStats);
    const report = advanceMonth(state, catalog, balance, () => .5);
    const baseline = advanceMonth(withoutExports, catalog, balance, () => .5);
    const income = state.market.lastExports.income;
    assert(income > 0); near(report.fiscal.resourceIncome, income);
    near(report.fiscal.revenue, baseline.fiscal.revenue);
    near(report.fiscal.net - baseline.fiscal.net, income);
    near(report.after.treasury - report.before.treasury, report.fiscal.net + report.fiscal.borrowed);
    near(report.resourceSummary.income, income);
    assert.deepEqual(originalStats, snapshot); assert.deepEqual(report.before, snapshot);
    if (treasury === .001) {
      assert(baseline.fiscal.borrowed > income);
      near(baseline.fiscal.borrowed - report.fiscal.borrowed, income);
      near(baseline.after.gdp * baseline.after.debt / 100 - report.after.gdp * report.after.debt / 100, income);
    } else near(report.after.treasury - baseline.after.treasury, income);
    assert(validGame(state, catalog));
  }
});

test('การขายเองและอัตโนมัติใช้ประวัติเดียว เรือเริ่มตรงขอบเดือนโดยไม่เพิ่มเงินซ้ำ', () => {
  const { state, catalog } = setup();
  state.countries.AUS.resourceStock.oil = 20;
  setExportSetting(state, 'oil', { enabled: true, share: 1 }, balance);
  const production = resourceProduction(state.countries.AUS, catalog.resourceLevels.get('AUS'), balance);
  const oldMonth = monthIndex(state), manualIncome = sellResource(state, 'oil', balance, catalog);
  near(manualIncome, .03); assert.equal(state.exportVisuals.length, 1);
  assert.equal(takeMonthlyExports(state).length, 0);
  advanceMonth(state, catalog, balance, () => .5);
  assert.equal(state.exportVisuals.length, 1);
  const entry = state.exportVisuals[0];
  assert.equal(entry.month, oldMonth); assert.equal(entry.units, 10 + production.oil);
  near(entry.value, manualIncome + state.market.lastExports.income);
  const cash = state.countries.AUS.treasury, stock = structuredClone(state.countries.AUS.resourceStock);
  const alreadyProcessed = processAutoExports(state, catalog, balance, production, stock);
  assert.equal(alreadyProcessed.income, 0); assert.deepEqual(alreadyProcessed.stats.resourceStock, stock);
  near(alreadyProcessed.stats.treasury, cash); assert.equal(state.exportVisuals.length, 1);
  assert.deepEqual(takeMonthlyExports(state), [entry]);
  assert.deepEqual(takeMonthlyExports(state), []); near(state.countries.AUS.treasury, cash);
});

test('เซฟเก่าไม่มีตลาดยังโหลดได้ และเพิ่มค่าเริ่มต้นโดยไม่แก้ข้อมูลเดิม', () => {
  const { state, catalog } = setup(); delete state.market;
  state.playerCountryId = 'QAT'; state.selectedCountryId = 'QAT';
  state.clock = { progress: .4, speed: 4, userPaused: true };
  state.countries.QAT.resourceStock.oil = 37;
  const original = structuredClone(state), store = storage();
  assert(writeSave('game', state, catalog, store).ok);
  const record = JSON.parse(store.getItem(SAVE_KEYS.game)); record.gameVersion = '0.8.3';
  store.setItem(SAVE_KEYS.game, JSON.stringify(record));
  const loaded = readSave('game', catalog, store); assert.equal(loaded.status, 'valid');
  const market = ensureMarket(loaded.state, balance);
  const { market: added, ...rest } = loaded.state; assert.deepEqual(rest, original);
  assert.equal(added, market);
  assert(RESOURCE_IDS.every(id => !market.exports[id].enabled && market.exports[id].share === 0));
  const snapshot = structuredClone(loaded.state); ensureMarket(loaded.state, balance); assert.deepEqual(loaded.state, snapshot);
  assert(writeSave('game', loaded.state, catalog, store).ok);
});

test('เซฟใหม่เก็บราคา สัดส่วนส่งออก คลัง คิวผลิต คูลดาวน์ และประวัติเรือครบ', () => {
  const { state, catalog } = setup();
  state.countries.AUS.resourceStock.iron = 100; state.countries.AUS.resourceStock.oil = 100;
  assert(enqueueProduction(state, catalog, 'tank'));
  state.clock = { progress: .25, speed: 2, userPaused: true };
  state.traitState = { AUS: { activeUntil: marketDay(state) + 30, cooldownUntil: marketDay(state) + 730 } };
  addMarketEffects(state, [{ resourceId: 'oil', percent: 15, durationDays: 60 }], 'event:save');
  setExportSetting(state, 'oil', { enabled: true, share: .5 }, balance);
  advanceMonth(state, catalog, balance, () => 1);
  const store = storage(); assert(writeSave('game', state, catalog, store).ok);
  const loaded = readSave('game', catalog, store); assert.equal(loaded.status, 'valid'); assert.deepEqual(loaded.state, state);
  const income = loaded.state.countries.AUS.treasury;
  takeMonthlyExports(loaded.state); near(loaded.state.countries.AUS.treasury, income);
});

test('ไม่รับข้อมูลราคา การส่งออก และสรุปขนส่งที่เสียหายในเซฟ', () => {
  const { state, catalog } = setup(); allExports(state); advanceMonth(state, catalog, balance, () => .5);
  assert(validMarket(undefined)); assert(!validMarket(null)); assert(validMarket(state.market));
  const changes = [
    m => { m.lastMonth = .5; }, m => { m.prices.oil = .49; }, m => { m.prices.oil = 2.01; },
    m => { m.prices.oil = NaN; }, m => { delete m.prices.uranium; },
    m => { m.history.oil = []; }, m => { m.history.oil = Array(13).fill(m.history.oil[0]); },
    m => { m.history.oil[0].month = .5; }, m => { m.history.oil[0].priceMillions = -1; },
    m => { m.exports.oil.enabled = 1; }, m => { m.exports.oil.share = .75; },
    m => { m.lastExports.month = .5; }, m => { m.lastExports.units = -1; },
    m => { m.lastExports.capacity = -1; }, m => { m.lastExports.capacity = m.lastExports.units - 1; },
    m => { m.lastExports.mode = 'unknown'; }, m => { m.lastExports.income = Infinity; },
    m => { m.lastExports.items[0].resourceId = 'unknown'; }, m => { m.lastExports.items[0].units = -1; },
    m => { m.lastExports.items[0].value = -1; }, m => { m.lastExports.items[0].units++; },
    m => { m.lastExports.items[0].value += 1; },
  ];
  for (const change of changes) {
    const broken = structuredClone(state); change(broken.market);
    assert.equal(validMarket(broken.market), false, change.toString());
    assert.equal(validGame(broken, catalog), false, change.toString());
  }
  const settings = structuredClone(state.market.exports);
  for (const [id, setting] of [['unknown', { enabled: true, share: 1 }], ['oil', { enabled: 1, share: 1 }], ['oil', { enabled: true, share: .75 }]]) {
    assert.equal(setExportSetting(state, id, setting, balance), false);
  }
  assert.deepEqual(state.market.exports, settings);
  assert(validMarketEffects(undefined));
  for (const effect of [
    { resourceId: 'unknown', percent: 10, endDay: 12000, sourceId: 'test' },
    { resourceId: 'oil', percent: -100, endDay: 12000, sourceId: 'test' },
    { resourceId: 'oil', percent: 10, endDay: .5, sourceId: 'test' },
    { resourceId: 'oil', percent: 10, endDay: 12000, sourceId: 1 },
  ]) assert.equal(validMarketEffects([effect]), false);
});
