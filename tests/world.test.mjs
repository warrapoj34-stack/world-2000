import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareWorld } from '../js/data/world.js';
import { geoContains, geoArea } from '../lib/d3-7.9.0.js';
import { feature } from '../lib/topojson-client-3.1.0.js';

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [topology, names, settings] = await Promise.all([
  read('countries-50m.json'), read('country-names-th.json'), read('world-2000.json'),
]);
const original = JSON.stringify(topology);
const { countries } = prepareWorld(topology, names, settings);
const get = id => countries.find(country => country.id === id);

test('มีชื่อไทยและรหัสไม่ซ้ำครบทุกพื้นที่หลังรวม', () => {
  assert.equal(countries.length, 237);
  assert.equal(new Set(countries.map(country => country.id)).size, 237);
  assert(countries.every(country => /[ก-๙]/u.test(country.properties.nameTh)));
  assert.equal(get('764').properties.nameTh, 'ไทย');
  assert.equal(get('036').properties.sourceNames.length, 2);
});

test('ซูดานครอบคลุมคาร์ทูมและจูบาโดยไม่มีซูดานใต้แยก', () => {
  assert(geoContains(get('729'), [32.56, 15.5]));
  assert(geoContains(get('729'), [31.6, 4.85]));
  assert.equal(get('728'), undefined);
});

test('ยูโกสลาเวียครอบคลุมเซอร์เบีย มอนเตเนโกร และโคโซโว', () => {
  for (const point of [[20.46, 44.81], [19.26, 42.44], [21.16, 42.66]]) {
    assert(geoContains(get('YUG'), point));
  }
  assert.equal(get('688'), undefined);
  assert.equal(get('499'), undefined);
  assert(!countries.some(country => country.properties.nameTh === 'โคโซโว'));
});

test('การรวมรักษาพื้นที่เดิมและไม่แก้ topology ต้นฉบับ', () => {
  for (const group of settings.merges) {
    const expected = topology.objects.countries.geometries
      .filter(geometry => group.members.includes(geometry.properties.name))
      .reduce((sum, geometry) => sum + geoArea(feature(topology, geometry)), 0);
    assert(Math.abs(geoArea(get(group.id)) - expected) < 1e-10);
  }
  assert.equal(JSON.stringify(topology), original);
});

test('ติมอร์-เลสเตเป็นสีเทาภายใต้การดูแลของสหประชาชาติ', () => {
  const country = get('626');
  assert.equal(country.properties.color, '#999fa4');
  assert.equal(country.properties.administration, 'UN');
  assert.match(country.properties.statusTh, /สหประชาชาติ/);
  assert(geoContains(country, [125.58, -8.6]));
});

test('ต้องแจ้งข้อผิดพลาดถ้าพื้นที่สำหรับรวมไม่ครบ', () => {
  const missing = structuredClone(topology);
  missing.objects.countries.geometries = missing.objects.countries.geometries
    .filter(geometry => geometry.properties.name !== 'Kosovo');
  assert.throws(() => prepareWorld(missing, names, settings), /Kosovo/);
});
