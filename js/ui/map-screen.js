import { loadWorld } from '../data/world.js';
import { createWorldMap } from '../map/renderer.js';
import { getRelation } from '../diplomacy/relations.js';
import { renderStats, renderHUD, governmentName } from './stats.js';

export async function initializeMapScreen({ catalog, getState, onChange }) {
  const world = await loadWorld();
  if (world.countries.some(country => !catalog.byMapId.has(country.id))) throw new Error('ข้อมูลประเทศบนแผนที่ไม่ครบ');
  const picker = document.querySelector('#country-picker');
  const zoomIn = document.querySelector('#zoom-in');
  const zoomOut = document.querySelector('#zoom-out');
  const reset = document.querySelector('#reset-map');
  const zoomLevel = document.querySelector('#zoom-level');
  const detail = document.querySelector('#country-detail');
  const swatch = document.querySelector('#country-swatch');
  let restoring = true;
  const map = createWorldMap(document.querySelector('#world-map'), world, {
    onSelect(country) {
      const state = getState();
      const record = country ? catalog.byMapId.get(country.id) : null;
      const info = country?.properties;
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
      zoomLevel.value = `${zoom.toFixed(1)}×`;
      zoomIn.disabled = zoom >= world.settings.map.maxZoom - 0.001;
      zoomOut.disabled = zoom <= world.settings.map.minZoom + 0.001;
    },
    onViewChange(view) {
      const state = getState();
      if (state && !restoring) { state.view = view; onChange(); }
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
  return {
    ...map,
    setSession(state) {
      restoring = true;
      const savedView = state.view;
      map.resize();
      map.setPlayerCountry(catalog.byId.get(state.playerCountryId).mapId);
      map.selectCountry(state.selectedCountryId ? catalog.byId.get(state.selectedCountryId).mapId : '');
      if (savedView) map.setViewState(savedView);
      else map.selectCountry(catalog.byId.get(state.playerCountryId).mapId);
      state.view = map.getViewState();
      renderHUD(state, catalog);
      document.dispatchEvent(new Event('world-session'));
      restoring = false;
      onChange();
    },
  };
}
