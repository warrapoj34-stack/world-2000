import { defaultQuality } from './performance.js';
import { provinceOwner,territorySummary } from '../territories.js';
import { warOverlayState,warTargets } from '../war/engine.js';
import { createWarMapOverlay } from './war-map.js';
import { loadWorld } from '../data/world.js';
import { createWorldMap } from '../map/renderer.js';
import { getRelation } from '../diplomacy/relations.js';
import { renderStats, renderHUD, governmentName } from './stats.js';
import { topResources, mapResourceLevel, RESOURCE_COLORS } from '../resources.js';
import { loadTradeVisualData, createTradeVisuals } from './trade-visuals.js';

export async function initializeMapScreen({ catalog, balance, getState, onChange }) {
  const [world,tradeData] = await Promise.all([loadWorld(),loadTradeVisualData().catch(()=>null)]);
  if (world.countries.some(country => !catalog.byMapId.has(country.id))) throw new Error('ข้อมูลประเทศบนแผนที่ไม่ครบ');
  const picker = document.querySelector('#country-picker');
  const zoomIn = document.querySelector('#zoom-in');
  const zoomOut = document.querySelector('#zoom-out');
  const reset = document.querySelector('#reset-map');
  const zoomLevel = document.querySelector('#zoom-level');
  const detail = document.querySelector('#country-detail');
  const swatch = document.querySelector('#country-swatch');
  const pulse = document.querySelector('#player-pulse');
  const settings = document.querySelector('#map-settings');
  const modeToggle = document.querySelector('#toggle-map-mode');
  const qualityToggle = document.querySelector('#toggle-map-quality');
  const settingsMenu = document.querySelector('#map-settings-menu');
  let restoring = true;
  const warOverlay=createWarMapOverlay(document.querySelector('#war-map-overlay'));
  let selectedProvince=null;
  function renderProvinceCard(province){
    selectedProvince=province;const card=document.querySelector('#province-map-card');card.hidden=!province;if(!province)return;
    document.querySelector('#province-map-name').textContent=province.nameTh;
    const owner=provinceOwner(getState(),province),resource=catalog.resourceDefinitions.find(r=>r.id===province.resourceId);
    card.dataset.owner=owner;
    document.querySelector('#province-map-info').textContent=`ผู้ครอง: ${catalog.byId.get(owner).nameTh} • ${resource?resource.icon+' '+resource.nameTh:'ไม่มีทรัพยากรเด่นที่ระบุ'}`;
    const s=getState(),war=s.warfare?.wars.find(w=>w.enemy===owner),targetButton=document.querySelector('#war-target-province');
    targetButton.hidden=!war||!warTargets(s,catalog,s.playerCountryId,owner,balance).some(t=>t.province.id===province.id);
    targetButton.onclick=()=>document.dispatchEvent(new CustomEvent('war-province-target',{detail:province.id}));
  }
  const map = createWorldMap(document.querySelector('#world-map'), world, {
    onSelect(country) {
      const state = getState();
      const record = country ? catalog.byMapId.get(country.id) : null;
      const info = country?.properties;
      const top = document.querySelector('#country-top-resources');
      top.replaceChildren();
      if (record) {
        for (const resource of topResources(catalog.resourceLevels.get(record.id), catalog.resourceDefinitions)) {
          const badge = document.createElement('span'); badge.className = 'resource-badge';
          badge.textContent = `${resource.icon} ${resource.nameTh} ${catalog.resourceLevels.get(record.id)[resource.id]}★`;
          top.append(badge);
        }
        if (!top.childElementCount) top.textContent = 'ไม่มีทรัพยากรที่ประเมินไว้';
      }
      detail.dataset.countryId = country?.id ?? '';
      picker.value = country?.id ?? '';
      document.querySelector('#country-name').textContent = info?.nameTh ?? 'เลือกประเทศ';
      const territory=record&&state?territorySummary(state,catalog,record.id):null,label=document.querySelector('#country-territory');
      label.hidden=!territory?.total&&!territory?.acquired;label.textContent=territory?`ดินแดน ${territory.held}/${territory.total} ${territory.wholeCountry?'หน่วย':'จังหวัด'} (${Math.round(territory.percent)}%)`:'';
      document.querySelector('#country-category').textContent = record ? `${record.id} · ${governmentName(record)}` : 'ประเทศและดินแดน';
      document.querySelector('#country-note').textContent = info?.noteTh
        ?? (country ? (record.statusTh ?? record.nameEn)
          : 'แตะพื้นที่บนแผนที่ เพื่อดูชื่อประเทศและไฮไลต์พรมแดน');
      swatch.hidden = !country;
      if (country) swatch.style.setProperty('--country-color', info.color);
      const stats = document.querySelector('#country-stats');
      const relation = document.querySelector('#country-relation');
      stats.hidden = relation.hidden = !record;
      if (record && state) {
        renderStats(stats, state.countries[record.id], true);
        const friendship = getRelation(catalog, state.playerCountryId, record.id,state);
        relation.dataset.value = friendship.value;
        relation.className = friendship.value < -20 ? 'relation negative' : friendship.value > 20 ? 'relation positive' : 'relation';
        document.querySelector('#relation-label').textContent = record.id === state.playerCountryId
          ? 'ประเทศของคุณ' : `ความสัมพันธ์: ${friendship.value > 0 ? '+' : ''}${friendship.value} · ${friendship.label}`;
        document.querySelector('#relation-reason').textContent = friendship.reasonTh;
      }
      if (state && !restoring) {
        state.selectedCountryId = record?.id ?? null;
        onChange();
      }
      document.dispatchEvent(new CustomEvent('war-country',{detail:record?.id??null}));
    },
    onProvinceSelect:renderProvinceCard,
    onWarOverlay:warOverlay.update,
    onProvinceMarkerPosition(point){const marker=document.querySelector('#territory-alert');marker.hidden=!point?.visible;if(point){marker.style.left=point.x+'px';marker.style.top=point.y+'px';}},
    onZoom(zoom) {
      if(zoom<3)document.querySelector('#province-map-card').hidden=true;
      zoomLevel.value = `${Math.round(zoom)}×`;
      zoomIn.disabled = zoom >= world.settings.map.maxZoom - 0.001;
      zoomOut.disabled = zoom <= world.settings.map.minZoom + 0.001;
    },
    onViewChange(view) {
      const state = getState();
      if (state && !restoring) { state.view = view; onChange(); }
    },
    onPlayerPosition(point) {
      pulse.hidden = !point?.visible;
      if (point) { pulse.style.left = `${point.x}px`; pulse.style.top = `${point.y}px`; }
    },
  });
  document.querySelector('#territory-alert').onclick=()=>{const id=getState()?.provinceEvents?.pending?.provinceId;if(id)document.dispatchEvent(new CustomEvent('open-territory-event',{detail:id}));};
  const options = [...world.countries].sort((a, b) => a.properties.nameTh.localeCompare(b.properties.nameTh, 'th'))
    .map(country => new Option(country.properties.nameTh, country.id));
  picker.append(...options);
  picker.disabled = false;
  reset.disabled = false;
  picker.addEventListener('change', () => map.selectCountry(picker.value));
  zoomIn.addEventListener('click', () => map.zoomBy(1.5));
  zoomOut.addEventListener('click', () => map.zoomBy(1 / 1.5));
  reset.addEventListener('click', () => map.reset());
  document.querySelector('#focus-player').addEventListener('click', () => {
    const state = getState();
    if (state) map.focusCountry(catalog.byId.get(state.playerCountryId).mapId);
  });
  const mode = document.querySelector('#map-mode'), legend = document.querySelector('#resource-legend');
  const quality = document.querySelector('#map-quality');
  quality.value=defaultQuality;
  quality.addEventListener('change', () => map.setQuality(quality.value));
  const closeSettings = () => {
    settingsMenu.hidden = true;
    modeToggle.setAttribute('aria-expanded', 'false');
    qualityToggle.setAttribute('aria-expanded', 'false');
  };
  const openSettings = () => {
    settingsMenu.hidden = false;
    modeToggle.setAttribute('aria-expanded', 'true');
    qualityToggle.setAttribute('aria-expanded', 'true');
  };
  modeToggle.addEventListener('click', openSettings);
  qualityToggle.addEventListener('click', openSettings);
  document.addEventListener('pointerdown', event => { if (!settings.contains(event.target)) closeSettings(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettings(); });
  mode.append(new Option('แร่ธาตุ (ดาวสูงสุดในกลุ่ม)', 'minerals'), ...catalog.resourceDefinitions.map(r=>new Option(`${r.icon} ${r.nameTh}`,r.id)));
  function changeMode() {
    const state=getState(); if(!state)return;
    state.mapMode=mode.value; document.querySelector('#world-map').dataset.mapMode=mode.value;
    legend.hidden=mode.value==='political';
    map.setResourceColors(mode.value==='political'?null:country=>RESOURCE_COLORS[mapResourceLevel(catalog.resourceLevels.get(catalog.byMapId.get(country.id).id),mode.value)]);
    legend.replaceChildren();
    if(mode.value!=='political') {
      const label=document.createElement('span');label.textContent=mode.value==='minerals'?'เหล็ก ทองแดง ทอง แร่หายาก: ดาวสูงสุด':'จำนวนดาว • ไม่ใช่ของในคลัง';legend.append(label);
      const scale=document.createElement('div');scale.className='resource-scale';
      RESOURCE_COLORS.forEach((color,i)=>{const cell=document.createElement('span');cell.textContent=`${i}★`;cell.style.background=color;cell.style.color=i>2?'#fff':'#102736';scale.append(cell);});legend.append(scale);
    }
    onChange();
  }
  mode.addEventListener('change',changeMode);
  const trade = createTradeVisuals({map,world,catalog,getState,onChange,data:tradeData});
  let session=null,featureSet=null,warRevision=-1;
  return {
    ...map,
    destroy: () => { trade?.destroy();map.destroy(); },
    setSession(state) {
      const changedFeatures=featureSet!==catalog.territoryFeatures,newSession=session!==state;
      if(changedFeatures){featureSet=catalog.territoryFeatures;map.setProvinceFeatures(featureSet??[]);}
      if(changedFeatures||newSession||warRevision!==(state.warfare?.revision??0)){warRevision=state.warfare?.revision??0;map.setWarFronts(warOverlayState(state,catalog,balance));}
      map.setProvinceOwners(state.territories?.revision??0,p=>provinceOwner(state,p),id=>world.countries.find(c=>c.id===catalog.byId.get(id)?.mapId)?.properties.color,p=>world.countries.find(c=>c.id===catalog.byId.get(provinceOwner(state,p))?.mapId));
      if(selectedProvince)renderProvinceCard(selectedProvince);
      if(session===state){
        map.setProvinceAlert(state.provinceEvents?.pending?.provinceId);
        renderHUD(state,catalog);
        if(state.selectedCountryId){renderStats(document.querySelector('#country-stats'),state.countries[state.selectedCountryId],true);const t=territorySummary(state,catalog,state.selectedCountryId),label=document.querySelector('#country-territory');label.hidden=!t.total&&!t.acquired;label.textContent=`ดินแดน ${t.held}/${t.total} ${t.wholeCountry?'หน่วย':'จังหวัด'} (${Math.round(t.percent)}%)`;
          const friendship=getRelation(catalog,state.playerCountryId,state.selectedCountryId,state),relation=document.querySelector('#country-relation');relation.dataset.value=friendship.value;relation.className=friendship.value < -20?'relation negative':friendship.value>20?'relation positive':'relation';
          document.querySelector('#relation-label').textContent=state.selectedCountryId===state.playerCountryId?'ประเทศของคุณ':`ความสัมพันธ์: ${friendship.value>0?'+':''}${friendship.value} · ${friendship.label}`;document.querySelector('#relation-reason').textContent=friendship.reasonTh;
        }
        return;
      }
      session=state;
      map.setProvinceAlert(state.provinceEvents?.pending?.provinceId);
      restoring = true;
      const savedView = state.view;
      map.resize();
      map.setPlayerCountry(catalog.byId.get(state.playerCountryId).mapId);
      map.selectCountry(state.selectedCountryId ? catalog.byId.get(state.selectedCountryId).mapId : '');
      if (savedView) map.setViewState(savedView);
      else map.selectCountry(catalog.byId.get(state.playerCountryId).mapId);
      state.view = map.getViewState();
      renderHUD(state, catalog);
      mode.value=state.mapMode ?? 'political'; changeMode();
      document.dispatchEvent(new Event('world-session'));
      restoring = false;
      onChange();
    },
  };
}
