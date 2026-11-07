import { rerollDraft } from '../state.js';
import { renderStats, governmentName } from './stats.js';
import { PATHS } from '../victory.js';

export function createStartScreen({ catalog, onDraft, onAccept, onBack }) {
  const screen = document.querySelector('#start-screen');
  const name = document.querySelector('#draw-name');
  const status = document.querySelector('#draw-status');
  const result = document.querySelector('#draw-result');
  const accept = document.querySelector('#accept-country');
  const reroll = document.querySelector('#reroll-country');
  const picker = document.querySelector('#manual-country');
  const choose = document.querySelector('#choose-country');
  const victorySelect = document.querySelector('#start-victory-path');
  const victoryDetail = document.querySelector('#start-victory-detail');
  victorySelect.append(...Object.entries(PATHS).map(([id, path]) => new Option(path.name, id)));
  victorySelect.value = 'survival';
  victorySelect.addEventListener('change', () => { victoryDetail.textContent = PATHS[victorySelect.value].detail.replaceAll('เศรษฐกิจ','ประเทศ'); });
  let draft = null;
  let generation = 0;
  let busy = false;
  const eligible = catalog.newGameCountries ?? catalog.playable;
  if (catalog.newGameRegions) {
    for (const [region, ids] of Object.entries(catalog.newGameRegions)) {
      const group = document.createElement('optgroup'); group.label = region;
      group.append(...ids.map(id => catalog.byId.get(id)).sort((a,b) => a.nameTh.localeCompare(b.nameTh,'th')).map(country => new Option(country.nameTh, country.id)));
      picker.append(group);
    }
  } else picker.append(...eligible.map(country => new Option(country.nameTh, country.id)));

  function render() {
    const country = catalog.byId.get(draft.candidateId);
    name.textContent = country.nameTh;
    document.querySelector('#draw-code').textContent = `${country.id} · ${country.nameEn}`;
    document.querySelector('#draw-government').textContent = governmentName(country);
    document.querySelector('#draw-intro').textContent = `คุณคือผู้นำของ ${country.nameTh} ปี ค.ศ. 2000`;
    renderStats(document.querySelector('#draw-stats'), country);
    picker.value = country.id;
    result.hidden = false;
    status.textContent = draft.manual ? 'เลือกประเทศเองสำหรับทดสอบ' : 'ประเทศของคุณพร้อมแล้ว';
    reroll.textContent = `สุ่มใหม่ (${draft.rerollsRemaining}/3)`;
    reroll.disabled = busy || draft.rerollsRemaining === 0;
    accept.disabled = choose.disabled = picker.disabled = busy;
  }

  async function animate() {
    const current = ++generation;
    busy = true;
    result.hidden = true;
    accept.disabled = reroll.disabled = choose.disabled = picker.disabled = true;
    status.textContent = 'กำลังหมุนชะตาประเทศของคุณ…';
    screen.classList.add('is-spinning');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = reduced ? 1 : 15;
    for (let step = 0; step < steps; step++) {
      if (current !== generation) return;
      name.textContent = eligible[Math.floor(Math.random() * eligible.length)].nameTh;
      await new Promise(resolve => setTimeout(resolve, reduced ? 0 : 45 + step * 9));
    }
    if (current !== generation) return;
    screen.classList.remove('is-spinning');
    busy = false;
    render();
    accept.focus({ preventScroll: true });
  }

  reroll.addEventListener('click', () => {
    if (busy || !draft || draft.rerollsRemaining === 0) return;
    draft = rerollDraft(draft, catalog);
    onDraft(draft);
    animate();
  });
  choose.addEventListener('click', () => {
    if (busy || !eligible.some(country => country.id === picker.value)) return;
    draft = { ...draft, candidateId: picker.value, manual: true };
    onDraft(draft);
    render();
  });
  accept.addEventListener('click', () => { if (!busy && draft) onAccept(draft.candidateId, victorySelect.value); });
  document.querySelector('#cancel-start').addEventListener('click', () => { cancel(); onBack(); });
  function cancel() {
    generation++;
    busy = false;
    screen.classList.remove('is-spinning');
  }
  return {
    show(value, { spin = false, replacesSave = false } = {}) {
      cancel();
      draft = value;
      if (!eligible.some(country => country.id === draft.candidateId)) {
        draft = { ...draft, candidateId: 'USA', manual: false }; onDraft(draft);
      }
      victorySelect.value = 'survival'; victoryDetail.textContent = PATHS.survival.detail;
      document.querySelector('#replace-save-note').hidden = !replacesSave;
      render();
      if (spin) animate();
    },
    cancel,
  };
}
