import {ensureWarfare,warEligibility,declareWar,warTargets,selectWarTarget,setWarStance,setDisputeObjective,battlePreview,warSummary,warMonthlyCost,resolveWarProtest} from '../war/engine.js';
import {provinceOwner} from '../territories.js';
import {loadTerritoryMaps} from '../data/territories.js';
import {formatNumber,formatMoney} from './stats.js';
export function createWarScreen({catalog,balance,getState,onChange,onRefresh,onDone,onFocus}){
  const dialog=document.querySelector('#war-dialog'),body=document.querySelector('#war-content'),title=document.querySelector('#war-title'),close=document.querySelector('#close-war'),strip=document.querySelector('#war-strip'),selector=document.querySelector('#war-select'),declare=document.querySelector('#declare-war');
  let mode='',confirmation=null,busy=false;
  const active=()=>{const s=getState();return s?.warfare?.wars.find(w=>w.id===s.warfare.activeId)??s?.warfare?.wars[0];};
  function text(value,className=''){const p=document.createElement('p');p.textContent=value;p.className=className;body.append(p);return p;}
  function button(label,action,data){const b=document.createElement('button');b.type='button';b.className='map-button war-action';b.textContent=label;if(data)b.dataset.action=data;b.onclick=action;body.append(b);return b;}
  function show(name,heading){mode=name;title.textContent=heading;body.replaceChildren();close.hidden=false;close.textContent='กลับแผนที่';if(!dialog.open)dialog.showModal();}
  function save(){onChange();onRefresh();}
  function finish(){if(busy)return;dialog.close();mode='';onDone?.();}
  function refreshDeclare(id=getState()?.selectedCountryId){
    const s=getState(),reason=document.querySelector('#war-declare-reason');declare.hidden=!s||!id||id===s.playerCountryId;reason.hidden=declare.hidden;if(declare.hidden)return;
    const existing=s.warfare?.wars.find(w=>w.enemy===id),eligibility=warEligibility(s,catalog,id,balance);declare.disabled=!existing&&!eligibility.ok;declare.textContent=existing?'⚔️ ดูสงคราม':'⚔️ ประกาศสงคราม';reason.textContent=existing?'แตะจังหวัดสีแดงเพื่อเลือกเป้าหมาย':eligibility.ok?`รบ${eligibility.mode==='sea'?'ทางทะเล':'ทางบก'}ได้ • ต้องยืนยันอีก 2 ขั้น`:eligibility.reason;
  }
  function refresh(){
    const s=getState(),wars=s?.warfare?.wars??[];strip.hidden=!wars.length;refreshDeclare();if(!wars.length)return;
    const war=active(),ids=wars.map(w=>String(w.id)).join(',');
    if(selector.dataset.ids!==ids){selector.replaceChildren(...wars.map(w=>new Option(catalog.byId.get(w.enemy).nameTh,w.id)));selector.dataset.ids=ids;}
    selector.value=String(war.id);const summary=warSummary(s,catalog,war),p=catalog.territoryById.get(war.target),holding=p&&provinceOwner(s,p)===s.playerCountryId,progress=holding?100-(war.counter.target===p.id?war.counter.progress:0):war.progress;
    document.querySelector('#war-months').textContent=`เดือน ${war.months} • ได้ ${summary.gained} เสีย ${summary.lost}`;
    document.querySelector('#war-target-label').textContent=p?`${holding?'ป้องกัน':'ยึด'} ${p.nameTh} ${Math.round(progress)}%`:'เลือกจังหวัดสีแดง';
    const bar=document.querySelector('#war-progress');bar.value=Math.round(progress);bar.setAttribute('aria-label',p?`${p.nameTh} ${Math.round(progress)}%`:'ยังไม่เลือกเป้าหมาย');
    if(dialog.open&&mode==='manage')manage(false);
  }
  async function commit(){
    if(busy||!confirmation)return;busy=true;close.disabled=true;for(const b of body.querySelectorAll('button'))b.disabled=true;
    const {enemy,provinceId,onSuccess}=confirmation,s=getState();
    try{
      await loadTerritoryMaps(s,catalog,{opponents:[...(s.warfare?.wars??[]).map(w=>w.enemy),enemy]});
      const war=declareWar(s,catalog,balance,enemy,{provinceId});if(!war)throw new Error('เริ่มสงครามไม่ได้ กรุณาตรวจชายแดนและจำนวนเรือรบ');
      onSuccess?.();save();dialog.close();mode='';manage();
    }catch(error){showConfirmation(2);text(error.message,'bad');}
    finally{busy=false;close.disabled=false;}
  }
  function showConfirmation(step){
    const s=getState(),enemy=catalog.byId.get(confirmation.enemy);show(`confirm${step}`,`${step}/2 • ${step===1?'เตรียมประกาศสงคราม':'ยืนยันประกาศสงคราม'}`);close.textContent='ยกเลิก';
    text(`คู่สงคราม: ${enemy.nameTh}`,'war-enemy');
    if(confirmation.provinceId)text(`พื้นที่พิพาท: ${catalog.territoryById.get(confirmation.provinceId).nameTh} • เริ่มด้วยการตั้งรับ`);
    text(`ค่าใช้จ่ายเริ่มประมาณ ${formatMoney(warMonthlyCost(s.countries[s.playerCountryId],1,balance))}/เดือน และเพิ่มเมื่อรบนานขึ้น`);
    text('ยูนิตเสียหายจริง ความสุขลด และความสัมพันธ์กับทั่วโลกแย่ลง กลุ่มเดียวกับศัตรูจะไม่พอใจมากขึ้น');
    button(step===1?'ดำเนินการต่อ':'ยืนยันประกาศสงคราม',()=>step===1?showConfirmation(2):commit(),step===1?'continue':'declare');
  }
  function confirmWar(enemy,{provinceId=null,onSuccess=null}={}){
    const s=getState(),existing=s.warfare?.wars.find(w=>w.enemy===enemy);
    if(existing){if(provinceId&&!setDisputeObjective(s,catalog,balance,existing,provinceId))return;ensureWarfare(s).activeId=existing.id;onSuccess?.();save();manage();return;}
    const eligibility=warEligibility(s,catalog,enemy,balance);if(!eligibility.ok){show('info','ยังประกาศสงครามไม่ได้');text(eligibility.reason);return;}
    confirmation={enemy,provinceId,onSuccess};showConfirmation(1);
  }
  function manage(open=true){
    const s=getState(),war=active();if(!war)return;if(open)show('manage',`สงครามกับ${catalog.byId.get(war.enemy).nameTh}`);else body.replaceChildren();
    const targets=warTargets(s,catalog,s.playerCountryId,war.enemy,balance),current=catalog.territoryById.get(war.target),holding=current&&provinceOwner(s,current)===s.playerCountryId;
    text('เลือกได้ครั้งละ 1 จังหวัด • เปลี่ยนเป้าหมายแล้วหลอดเริ่มใหม่');
    const label=document.createElement('label');label.htmlFor='war-target-picker';label.textContent='จังหวัดเป้าหมาย';body.append(label);
    const picker=document.createElement('select');picker.id='war-target-picker';picker.className='war-target-picker';picker.append(new Option('แตะจังหวัดสีแดง หรือเลือกที่นี่',''));
    if(holding)picker.append(new Option(`ป้องกัน ${current.nameTh}`,current.id));
    picker.append(...targets.map(t=>new Option(`${t.province.nameTh} • ${t.via==='sea'?'ทางทะเล':'ทางบก'}`,t.province.id)));picker.value=war.target??'';
    picker.onchange=()=>{if(picker.value&&selectWarTarget(s,catalog,balance,war.id,picker.value)){onFocus(picker.value);save();}};body.append(picker);
    if(!targets.length)text('ยังไม่มีจังหวัดที่บุกได้ ตรวจชายแดนหรือเรือรบสำหรับยกพลขึ้นบก');
    const group=document.createElement('div');group.className='war-stance';body.append(group);
    for(const [id,name]of [['attack','บุก'],['defend','ตั้งรับ']]){const b=document.createElement('button');b.type='button';b.className='map-button';b.dataset.stance=id;b.textContent=name;b.setAttribute('aria-pressed',String(war.stance===id));b.disabled=holding&&id==='attack';b.onclick=()=>{if(setWarStance(s,war.id,id))save();};group.append(b);}
    text('บุกเพื่อเพิ่มหลอดยึด • ตั้งรับช่วยลดการสูญเสียและหยุดการรุก');
    const preview=battlePreview(s,catalog,balance,war);
    if(preview){text(`${preview.province.nameTh} • ${preview.holding?'ป้องกันพื้นที่เรา':preview.via==='sea'?'บุกทางทะเล':'บุกทางบก'}`);text(`พลังบุก ${formatNumber(preview.attack)} / พลังตั้งรับ ${formatNumber(preview.defense)}${preview.holding?'':` • หลอด ${Math.round(preview.change)>=0?'+':''}${Math.round(preview.change)}%/เดือน`}`);text('ภูมิประเทศ เสบียง และจุดเด่นด้านต้นทุนผลิตมีผลกับพลังรบ');button('โฟกัสเป้าหมาย',()=>{dialog.close();mode='';onFocus(war.target);});}
    if(war.counter.target)text(`⚠️ ศัตรูตีโต้ ${catalog.territoryById.get(war.counter.target).nameTh} • ยึด ${Math.round(war.counter.progress)}%`);
    text(`ค่าใช้จ่ายเดือนถัดไปประมาณ ${formatMoney(warMonthlyCost(s.countries[s.playerCountryId],war.months+1,balance))}`);
    if(war.lastBattle){const loss=war.lastBattle.losses.player;text(`เดือนล่าสุดเสีย: รถถัง ${loss.tanks} เครื่องบิน ${loss.aircraft} เรือ ${loss.ships}`);}
    text(`ดินแดนต่างชาติที่เพิ่งยึด: รายรับและผลผลิต ${Math.round(balance.war.occupationShare*100)}% นาน ${balance.war.occupationMonths} เดือน และเสี่ยงต่อต้าน`);
  }
  function resume(){
    const s=getState(),data=s?.warfare;if(!data||s.economy?.gameOver||s.victory?.finished)return false;
    if(data.notices.length){show('notice','🕊️ ควรเข้าสู่การเจรจา');close.hidden=true;text(data.notices[0].text);text('ระบบเจรจาจะเปิดใน P4-C รอบนี้เป็นการแจ้งเตือน สามารถเล่นต่อได้');button('รับทราบ',()=>{data.notices.shift();save();finish();},'acknowledge');return true;}
    if(data.protest){show('protest','📣 ประท้วงต่อต้านสงคราม');close.hidden=true;text('ประชาชนไม่พอใจสงครามที่ยืดเยื้อ ต้องเลือกว่าจะดูแลสถานการณ์อย่างไร');
      const cost=s.countries[s.playerCountryId].gdp*balance.war.protestCostGDP;
      button(`รับฟังและช่วยประชาชน • ${formatMoney(cost)} • 😊 +${balance.war.protestReliefHappiness}`,()=>{if(resolveWarProtest(s,balance,'relief')){save();finish();}},'relief').disabled=s.countries[s.playerCountryId].treasury<cost;
      button(`เดินหน้ารบ • 😊 −${balance.war.protestRejectHappiness} • ชื่อเสียง −${balance.war.protestRejectReputation}`,()=>{resolveWarProtest(s,balance,'continue');save();finish();},'continue-war');return true;
    }
    return false;
  }
  close.onclick=finish;dialog.addEventListener('cancel',e=>{e.preventDefault();if(!['notice','protest'].includes(mode))finish();});
  declare.onclick=()=>confirmWar(getState().selectedCountryId);document.querySelector('#war-manage').onclick=()=>manage();
  selector.onchange=()=>{ensureWarfare(getState()).activeId=Number(selector.value);save();};
  document.addEventListener('war-country',e=>refreshDeclare(e.detail));
  document.addEventListener('war-province-target',e=>{const s=getState(),war=s.warfare?.wars.find(w=>w.enemy===provinceOwner(s,catalog.territoryById.get(e.detail)));if(war&&selectWarTarget(s,catalog,balance,war.id,e.detail)){setWarStance(s,war.id,'attack');onFocus(e.detail);save();}});
  return {refresh,resume,confirmWar};
}
