import { readFile,writeFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { attachPlayable } from '../js/data/playable.js';
import { attachMilitary } from '../js/war/military.js';
import { startingOutlook } from '../js/data/starting.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [countries,relations,ids,regions,military,rules,traits,policies,balance]=await Promise.all(['countries_2000','relations_2000','playable','playable_regions','military2000','military_rules','traits','policies','balance'].map(read));
const catalog=attachPlayable(createCatalog(countries,relations),ids,regions);attachMilitary(catalog,military,rules);catalog.traits=traits;catalog.policies=policies;
const integer=value=>Math.round(value*1000).toLocaleString('en-US');
const lines=['# เงินเริ่มต้น 40 ประเทศ — v0.9.4','','หน่วยเงินทุกช่อง: **ล้านดอลลาร์** ปัดเป็นจำนวนเต็ม รายรับสุทธิคำนวณจริงโดยยังไม่ปัด ต้องไม่ต่ำกว่า 0 ทุกประเทศ','','ภาษีกลาง 25% งบสมดุล ไม่มีนโยบายพิเศษ/ความสามารถที่กำลังใช้งาน และยังไม่ส่งออก อัตรารายจ่ายพื้นฐานลดจาก 25% เป็น 16% ของ GDP ต่อปี ใช้สูตรเดิม หนี้และเงินคลังตั้งต้นไม่ได้เพิ่มหรือลด ส่วนจุดอ่อนอิรักเปลี่ยนเป็นต้นทุนผลิต +25%','','เซฟเก่ายังคงเงิน หนี้ นโยบาย ยูนิตและคูลดาวน์เดิม อัตรารายจ่ายใหม่มีผลตั้งแต่การคำนวณเดือนถัดไป ไม่รีเซ็ตข้อมูลเซฟ','','ความยากคำนวณจากเงินคลัง กองทัพสามเหล่าที่ถ่วงน้ำหนัก และขนาดผลเสียของจุดอ่อน เป็นคำแนะนำการเลือกประเทศ ไม่เพิ่มโบนัสหรือบทลงโทษ','','เซอร์เบียจับคู่กับ **YUG — ยูโกสลาเวีย** ตามพรมแดนปี 2000 ไม่มีประเทศที่จับคู่ไม่ได้ ประเทศอื่นยังอยู่บนแผนที่และเป็น AI; รายการข้อมูลกองทัพ/จุดเด่นเดิมเก็บไว้รองรับเซฟเก่า',''];
for(const [region,list] of Object.entries(regions)){
  lines.push(`## ${region}`,'','| ประเทศ | รหัส | เงินคลังเริ่มต้น | รายรับสุทธิ/เดือน | ระดับความยาก |','|---|---|---:|---:|---|');
  for(const id of list){const country=catalog.byId.get(id),row=startingOutlook(country,catalog,balance);if(row.fiscal.net<0)throw new Error(`รายรับติดลบ ${id}`);lines.push(`| ${country.nameTh}${id==='YUG'?' (เซอร์เบีย)':''} | ${id} | ${integer(row.treasury)} | +${integer(row.fiscal.net)} | ${row.difficulty} |`);}
  lines.push('');
}
lines.push('สร้างรายงานซ้ำด้วย `node tools/report-starting.mjs` โดยใช้โค้ดคำนวณเดียวกับการ์ดเลือกประเทศ','');
await writeFile(new URL('../STARTING-BALANCE-v0.9.4.md',import.meta.url),lines.join('\n'));
console.log(`สร้างรายงาน ${ids.length} ประเทศ ไม่มีรายรับเริ่มต้นติดลบ`);
