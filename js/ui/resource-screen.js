import { resourceProduction, resourceEffects, reinforceArmy, ensureResources } from '../resources.js';
import { formatNumber } from './stats.js';
export function createResourceScreen({catalog,balance,getState,onChange,onRefresh}) {
  const dialog=document.querySelector('#resource-dialog'), body=document.querySelector('#resource-content');
  const title=document.querySelector('#resource-title');
  const defs=catalog.resourceDefinitions;
  const addText=(text,className='')=>{const p=document.createElement('p');p.textContent=text;p.className=className;body.append(p);};
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
      addText(`มีในคลัง ${formatNumber(stats.resourceStock[id])} หน่วย • ราคากลาง ${formatNumber(resource.basePrice*1000)} ล้านดอลลาร์ต่อหน่วย`);
      addText('ผลผลิตและราคาเป็นหน่วยสมมติสำหรับเกม ไม่ใช่ตันหรือราคาซื้อขายจริง ธรรมชาติหมายถึงบริการจากระบบนิเวศ ไม่ใช่จำนวนสัตว์ที่นำมาขาย');
      if(id==='iron') {
        const b=balance.resources.reinforcement;
        addText(`เสริมกำลังกองทัพ +${b.military} ใช้เหล็ก ${b.iron} หน่วยและเงิน ${formatNumber(b.money*1000)} ล้านดอลลาร์`);
        const buy=document.createElement('button');buy.id='buy-reinforcement';buy.className='map-button';buy.type='button';buy.textContent='ใช้เหล็กเสริมกำลัง';
        buy.disabled=Boolean(state.economy?.gameOver)||stats.military>=100||stats.resourceStock.iron<b.iron||stats.treasury<b.money;
        buy.addEventListener('click',()=>{if(reinforceArmy(state,balance)){onChange();onRefresh();open('iron');addText('เสริมกำลังแล้ว','good');}});body.append(buy);
        if(buy.disabled)addText(stats.military>=100?'กองทัพพร้อมเต็มที่แล้ว':state.economy?.gameOver?'เกมนี้จบแล้ว':'เหล็กหรือเงินยังไม่พอ จบเทิร์นเพื่อรับผลผลิตก่อน');
      }
      const back=document.createElement('button');back.className='map-button';back.type='button';back.id='all-resources';back.textContent='ดูทรัพยากรทั้งหมด';back.addEventListener('click',()=>open());body.append(back);
    } else {
      const effects=resourceEffects(stats,levels,defs,balance,()=>1);
      addText(`รายได้จากทรัพยากรประมาณ ${formatNumber(effects.revenue*1000)} ล้านดอลลาร์ต่อเทิร์น • น้ำช่วยลดผลเสียภัยแล้ง ${Math.round(effects.protection*100)}%`);
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
