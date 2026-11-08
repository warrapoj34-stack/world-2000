import { ensureProvinces, buildProvince, projectCost, projectMissing, constructionProgress, PROVINCE_PROJECTS } from '../provinces.js';
import { fiscalForecast } from '../economy.js';
import { traitModifiers } from '../traits.js';
import { policyModifiers } from '../policies.js';
import { formatNumber, formatMoney } from './stats.js';
function provinceRows(state,catalog,balance){
  const saved=ensureProvinces(state,catalog);if(!saved)return [];
  const stats=state.countries[state.playerCountryId],country=catalog.byId.get(state.playerCountryId),b=catalog.provinceData.balance;
  const revenue=fiscalForecast(stats,country.government,state.economy.policy,balance,1).revenue*traitModifiers(state,catalog).taxIncome*(catalog.policies?policyModifiers(state.economy.cards,catalog.policies).revenue:1);
  return catalog.provinceData.countries[state.playerCountryId].map(p=>{const region=saved.regions[p.id],l=region.levels;return {...p,region,population:stats.population*1e6*p.populationShare,income:revenue*p.incomeShare*(1+l.roads*b.roadIncomeBonus+l.factory*b.factoryIncomeBonus+l.port*b.portIncomeBonus)};});
}
export function renderProvinceList(parent,{state,catalog,balance,onSelect}){
  const rows=provinceRows(state,catalog,balance),note=document.createElement('p');
  note.textContent=rows.length?'เรียงตามความสำคัญทางรายได้ • แตะจังหวัดเพื่อซูมและสั่งก่อสร้าง':'จังหวัดทดลองเปิดเฉพาะไทย สหรัฐฯ ญี่ปุ่น ฝรั่งเศส และจีน';parent.append(note);
  if(!rows.length)return;
  const sum=document.createElement('p');sum.textContent=`รายได้จังหวัดรวม +${formatMoney(rows.reduce((n,p)=>n+p.income,0))}/เดือน ก่อนหักรายจ่ายประเทศ • ความสุขเฉลี่ยถ่วงตามประชากร`;parent.append(sum);
  const hint=document.createElement('p');hint.textContent='ประชากรและระดับความเจริญเป็นค่าประเมินเกม สัดส่วนจังหวัดรวมตรงกับประเทศ';parent.append(hint);
  const list=document.createElement('div');list.className='province-list';parent.append(list);
  for(const p of rows.sort((a,b)=>b.income-a.income)){
    const button=document.createElement('button');button.type='button';button.className='province-row';button.dataset.province=p.id;
    const name=document.createElement('strong');name.textContent=p.nameTh;
    const population=document.createElement('span');population.textContent=`👥 ${formatNumber(p.population)} คน`;
    const stars=document.createElement('span');stars.textContent=`${'★'.repeat(Math.min(5,p.development+Math.floor(Object.values(p.region.levels).reduce((a,b)=>a+b,0)/2)))} • 😊 ${formatNumber(p.region.happiness)}`;
    const money=document.createElement('span');money.className='good';money.textContent=`+${formatMoney(p.income)}/เดือน`;
    button.append(name,population,stars,money);button.onclick=()=>onSelect(p);list.append(button);
  }
}
export function createProvinceScreen({catalog,balance,getState,onChange,onRefresh,onFocus,onBack}){
  const dialog=document.querySelector('#province-dialog'),body=document.querySelector('#province-content'),title=document.querySelector('#province-title');
  document.querySelector('#close-province').onclick=()=>dialog.close();
  function open(province){
    const state=getState(),saved=ensureProvinces(state,catalog);if(!saved)return;
    onFocus(province);title.textContent=province.nameTh;body.replaceChildren();
    const current=provinceRows(state,catalog,balance).find(p=>p.id===province.id),p=document.createElement('p');p.textContent=`👥 ${formatNumber(current.population)} คน • 😊 ${formatNumber(current.region.happiness)}/100 • +${formatMoney(current.income)}/เดือน`;body.append(p);
    const resource=catalog.resourceDefinitions.find(r=>r.id===province.resourceId),production=document.createElement('p');production.textContent=`โรงงานจังหวัด: ${resource.icon} ${resource.nameTh} +${Math.round(current.region.levels.factory*catalog.provinceData.balance.factoryUnits*(traitModifiers(state,catalog).resourceOutput[province.resourceId]??1))} หน่วย/เดือน${province.coastal?' • มีชายฝั่งทะเล':' • ไม่มีชายฝั่งทะเล'}`;body.append(production);
    const job=saved.queue.find(j=>j.provinceId===province.id);
    if(job){const label=document.createElement('p');label.textContent=`🏗️ ${catalog.provinceData.projects[job.project].nameTh} • ${constructionProgress(state,job)}%`;const bar=document.createElement('progress');bar.id='province-progress';bar.max=100;bar.value=constructionProgress(state,job);bar.setAttribute('aria-label',label.textContent);body.append(label,bar);}
    const actions=document.createElement('div');actions.className='province-actions';body.append(actions);
    for(const project of PROVINCE_PROJECTS.filter(k=>k!=='port'||province.coastal)){
      const rule=catalog.provinceData.projects[project],cost=projectCost(state,catalog,province.id,project),missing=projectMissing(state,catalog,province.id,project);
      const button=document.createElement('button');button.type='button';button.className='province-project';button.dataset.project=project;button.disabled=missing.length>0;
      const heading=document.createElement('strong');heading.textContent=`${rule.icon} ${rule.nameTh} • ระดับ ${current.region.levels[project]}/3`;
      const price=document.createElement('span');price.textContent=`💰 ${formatMoney(cost.money)} • ${Object.entries(cost.resources).map(([id,n])=>`${catalog.resourceDefinitions.find(r=>r.id===id).icon} ${n}`).join(' ')} • ${cost.days} วัน`;
      const effect=document.createElement('span');effect.textContent=rule.description+(project==='factory'?` (${resource.nameTh})`:'');
      button.append(heading,price,effect);
      if(missing.length){const reason=document.createElement('span');reason.textContent=missing.join(' • ');button.append(reason);}
      button.onclick=()=>{if(buildProvince(state,catalog,province.id,project)){onChange();onRefresh();open(province);}};actions.append(button);
    }
    const note=document.createElement('p');note.textContent='สร้างได้จังหวัดละ 1 โครงการพร้อมกัน • ปิดหน้านี้ให้เวลาเดิน งานจะเสร็จตามวันที่เกม • จังหวัดที่ไม่ได้ลงทุนเลยจะค่อยๆ เสียความสุข';body.append(note);
    const back=document.createElement('button');back.type='button';back.className='map-button';back.textContent='← รายชื่อจังหวัด';back.onclick=()=>{dialog.close();onBack();};body.append(back);
    if(!dialog.open)dialog.showModal();
  }
  return {open};
}
