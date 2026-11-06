import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ensurePolicyCards,choosePolicy,policyModifiers} from '../js/policies.js';
const data=JSON.parse(await readFile(new URL('../data/policies.json',import.meta.url)));
const make=()=>({economy:{turns:0,gameOver:null,policy:{tax:50,budget:{}}}});
test('เซฟเก่าเริ่มกลางและสมดุล ค่ารวม100 และการดูตัวอย่างไม่เปลี่ยนเซฟ',()=>{const s=make();ensurePolicyCards(s,data);assert.equal(s.economy.policy.tax,25);assert.equal(Object.values(s.economy.policy.budget).reduce((a,b)=>a+b),100);const p=structuredClone(s);choosePolicy(p,data,'democracy','tax','low');assert.equal(s.economy.policy.tax,25);});
test('รอสองเทิร์นจริงและบันทึกตัวนับได้',()=>{const s=make();assert(choosePolicy(s,data,'democracy','tax','low'));assert(!choosePolicy(s,data,'democracy','tax','high'));s.economy.turns=1;assert(!choosePolicy(s,data,'democracy','tax','high'));const loaded=JSON.parse(JSON.stringify(s));loaded.economy.turns=2;assert(choosePolicy(loaded,data,'democracy','tax','high'));});
test('จำกัดระบอบ สามช่อง ไม่ซ้ำ และตัวคูณรวมค่าใช้จ่าย',()=>{const s=make();assert(!choosePolicy(s,data,'democracy','special','conscription',0));assert(choosePolicy(s,data,'democracy','special','exports',0));assert(!choosePolicy(s,data,'democracy','special','exports',1));assert(!choosePolicy(s,data,'democracy','special','tourism',3));assert(choosePolicy(s,data,'democracy','special','tourism',1));const m=policyModifiers(s.economy.cards,data);assert.equal(m.costRate,.002);assert(m.revenue>1);});
