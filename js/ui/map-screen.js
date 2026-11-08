import { defaultQuality } from './performance.js';
import { loadWorld } from '../data/world.js';
import { createWorldMap } from '../map/renderer.js';
import { getRelation } from '../diplomacy/relations.js';
import { renderStats, renderHUD, governmentName } from './stats.js';
import { topResources, mapResourceLevel, RESOURCE_COLORS } from '../resources.js';
import { loadTradeVisualData, createTradeVisuals } from './trade-visuals.js';

export async function initializeMapScreen({ catalog, getState, onChange }) {
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
        const friendship = getRelation(catalog, state.playerCountryId, record.id);
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
    },
    onZoom(zoom) {
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
  let session=null;
  return {
    ...map,
    destroy: () => { trade?.destroy();map.destroy(); },
    setSession(state) {
      if(session===state){
        renderHUD(state,catalog);
        if(state.selectedCountryId)renderStats(document.querySelector('#country-stats'),state.countries[state.selectedCountryId],true);
        return;
      }
      session=state;
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
