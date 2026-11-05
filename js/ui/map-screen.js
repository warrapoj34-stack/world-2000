import { loadWorld } from '../data/world.js';
import { createWorldMap } from '../map/renderer.js';

export async function initializeMapScreen() {
  const world = await loadWorld();
  const picker = document.querySelector('#country-picker');
  const zoomIn = document.querySelector('#zoom-in');
  const zoomOut = document.querySelector('#zoom-out');
  const reset = document.querySelector('#reset-map');
  const zoomLevel = document.querySelector('#zoom-level');
  const detail = document.querySelector('#country-detail');
  const swatch = document.querySelector('#country-swatch');
  const map = createWorldMap(document.querySelector('#world-map'), world, {
    onSelect(country) {
      const info = country?.properties;
      detail.dataset.countryId = country?.id ?? '';
      picker.value = country?.id ?? '';
      document.querySelector('#country-name').textContent = info?.nameTh ?? 'เลือกประเทศ';
      document.querySelector('#country-category').textContent = info?.statusTh ?? 'ประเทศและดินแดน';
      document.querySelector('#country-note').textContent = info?.noteTh
        ?? (country ? 'กำลังสำรวจแผนที่ปี 2000 · ระบบบริหารประเทศยังไม่เปิดใช้งาน'
          : 'แตะพื้นที่บนแผนที่ เพื่อดูชื่อประเทศและไฮไลต์พรมแดน');
      swatch.hidden = !country;
      if (country) swatch.style.setProperty('--country-color', info.color);
    },
    onZoom(zoom) {
      zoomLevel.value = `${zoom.toFixed(1)}×`;
      zoomIn.disabled = zoom >= world.settings.map.maxZoom - 0.001;
      zoomOut.disabled = zoom <= world.settings.map.minZoom + 0.001;
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
  return map;
}
