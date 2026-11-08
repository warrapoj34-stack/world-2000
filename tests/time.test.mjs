import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceClock, ensureClock } from '../js/time.js';

test('เริ่มนาฬิกาที่ x4 โดยไม่ล้างวันที่ ความคืบหน้า หรือสถานะหยุดของเซฟเก่า',()=>{
  const state={date:{year:2001,month:3,day:12}};
  assert.equal(ensureClock(state).speed,4);
  state.clock={progress:.5,speed:2,userPaused:true};
  assert.deepEqual(ensureClock(state),{progress:.5,speed:2,userPaused:true});
  assert.equal(state.date.day,12);
});
test('คำนวณทุก 250 มิลลิวินาทีให้เดือนและวันเท่าเดิมที่ x4',()=>{
  function run(step){
    const state={date:{year:2000,month:1,day:1},economy:{},clock:{progress:0,speed:4,userPaused:false}};
    let months=0;
    for(let i=0;i<Math.round(65/step);i++)advanceClock(state,step,480,()=>{
      months++;state.date.month++;if(state.date.month>12){state.date.month=1;state.date.year++;}return true;
    });
    return {state,months};
  }
  const fine=run(1/60),batched=run(.25);
  assert.equal(batched.months,fine.months);
  assert.deepEqual(batched.state.date,fine.state.date);
  assert(Math.abs(batched.state.clock.progress-fine.state.clock.progress)<1e-9);
});
