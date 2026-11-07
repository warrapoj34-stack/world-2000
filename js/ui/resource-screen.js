import { resourceProduction, resourceEffects, reinforceArmy, ensureResources } from '../resources.js';
import { formatNumber, formatMoney } from './stats.js';
export function createResourceScreen({catalog,balance,getState,onChange,onRefresh}) {
  const dialog=document.querySelector('#resource-dialog'), body=document.querySelector('#resource-content');
  const title=document.querySelector('#resource-title');
  const defs=catalog.resourceDefinitions;
  const addText=(text,className='')=>{const p=document.createElement('p');p.textContent=String(text).replaceAll('เศรษฐกิจ','ประเทศ');p.className=className;body.append(p);};
  function open(id) {
    const state=getState(); ensureResources(state);
    const stats=state.countries[state.playerCountryId], levels=catalog.resourceLevels.get(state.playerCountryId);
    const production=resourceProduction(stats,levels,balance);
    body.replaceChildren();
    const resource=defs.find(r=>r.id===id);
    title.textContent=resource?`${resource.icon} ${resource.nameTh}`:'ทรัพยากรของประเทศ';
    if(resource) {
      addText(resource.descriptionTh,'resource-description');
      addText(`ระดับ ${levels[id]}/5 ดาว • ผลผลิตประมาณ ${formatNumber(production[id])} หน่วยต่อเทิร์น`);
      addText(`มีในคลัง ${formatNumber(stats.resourceStock[id])} หน่วย • ราคากลาง ${formatMoney(resource.basePrice)}ต่อหน่วย`);
      addText('ผลผลิตและราคาเป็นหน่วยสมมติสำหรับเกม ไม่ใช่ตันหรือราคาซื้อขายจริง ธรรมชาติหมายถึงบริการจากระบบนิเวศ ไม่ใช่จำนวนสัตว์ที่นำมาขาย');
      if(id==='iron') addText('ดูจำนวนรถถังได้ในหน้ากองทัพ • ระบบผลิตยูนิตจะเพิ่มภายหลัง');
      const back=document.createElement('button');back.className='map-button';back.type='button';back.id='all-resources';back.textContent='ดูทรัพยากรทั้งหมด';back.addEventListener('click',()=>open());body.append(back);
    } else {
      const effects=resourceEffects(stats,levels,defs,balance,()=>1);
      addText(`รายได้จากทรัพยากรประมาณ ${formatMoney(effects.revenue)}ต่อเทิร์น • น้ำช่วยลดผลเสียภัยแล้ง ${Math.round(effects.protection*100)}%`);
      addText('0 ดาว = ไม่มี • 5 ดาว = มหาศาล • แตะการ์ดเพื่อดูประโยชน์ ผลผลิตขึ้นกับดาว ขนาดประชากร และเทคโนโลยี');
      const grid=document.createElement('div');grid.className='resource-grid';
      for(const r of defs) {
        const card=document.createElement('button');card.type='button';card.className='resource-card';card.dataset.resource=r.id;
        const name=document.createElement('strong');name.textContent=`${r.icon} ${r.nameTh}`;
        const stars=document.createElement('span');stars.className='resource-stars';stars.textContent='★'.repeat(levels[r.id])+'☆'.repeat(5-levels[r.id]);stars.setAttribute('aria-label',`${levels[r.id]} จาก 5 ดาว`);
        const output=document.createElement('span');output.textContent=`+${formatNumber(production[r.id])} หน่วย / เทิร์น`;
        card.append(name,stars,output);card.addEventListener('click',()=>open(r.id));grid.append(card);
      }
      body.append(grid);addText('ระดับดาวเป็นค่าประมาณปี 2000 ผลผลิตอาจลดลงเมื่อเกิดภัยแล้ง ทรัพยากรบางส่วนขายอัตโนมัติ ที่เหลือเก็บในคลัง');
    }
    if(!dialog.open)dialog.showModal();
  }
  document.querySelector('#close-resources').addEventListener('click',()=>dialog.close());
  return {open};
}
