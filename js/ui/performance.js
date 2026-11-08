const tablet=matchMedia('(pointer: coarse)').matches || /Android/i.test(navigator.userAgent);
const key='world-2000:power-saving';
let saved=null;try{saved=localStorage.getItem(key);}catch{/* ใช้ค่าชั่วคราว */}
let saving=saved==='on'||saved===null&&((navigator.hardwareConcurrency??8)<=4||(navigator.deviceMemory??8)<=4);
export const defaultQuality=tablet?'medium':'high';
export const powerSaving=()=>saving;
export function setPowerSaving(value){
  saving=Boolean(value);document.documentElement.classList.toggle('power-saving',saving);
  try{localStorage.setItem(key,saving?'on':'off');}catch{/* ใช้ค่าชั่วคราว */}
  document.dispatchEvent(new Event('power-saving-change'));
}
document.documentElement.classList.toggle('power-saving',saving);
export function setupPerformance(){
  const toggle=document.querySelector('#power-saving');toggle.checked=saving;
  toggle.addEventListener('change',()=>setPowerSaving(toggle.checked));
  document.addEventListener('power-saving-change',()=>{toggle.checked=saving;});
  let last=performance.now(),slow=0,warmup=last+5000;
  function sample(now){
    const delta=now-last;last=now;
    if(now>warmup&&!document.hidden&&!document.querySelector('#map-screen').hidden&&!document.querySelector('dialog[open]')){
      slow=delta>40&&delta<5000?slow+Math.min(delta,250):Math.max(0,slow-50);
      if(slow>3000&&!saving){setPowerSaving(true);slow=0;}
    }else slow=0;
    requestAnimationFrame(sample);
  }
  toggle.addEventListener('change',()=>{warmup=performance.now()+30000;slow=0;});
  requestAnimationFrame(sample);
}
