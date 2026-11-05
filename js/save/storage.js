import { VERSION } from '../version.js';
import { validDraft, validGame } from '../state.js';

export const SAVE_VERSION = 1;
export const SAVE_KEYS = { game: 'world-2000:game', draft: 'world-2000:draft' };
const valid = (kind, state, catalog) => kind === 'game' ? validGame(state, catalog) : validDraft(state, catalog);

export function readSave(kind, catalog, storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(SAVE_KEYS[kind]);
    if (raw === null) return { status: 'empty' };
    let record;
    try { record = JSON.parse(raw); } catch { return { status: 'corrupt' }; }
    if (!record || typeof record !== 'object') return { status: 'corrupt' };
    if (record.saveVersion !== SAVE_VERSION) return { status: 'incompatible' };
    if (record.kind !== kind || !valid(kind, record.state, catalog)) return { status: 'corrupt' };
    return { status: 'valid', state: record.state, savedAt: record.savedAt };
  } catch {
    return { status: 'unavailable' };
  }
}

export function writeSave(kind, state, catalog, storage) {
  if (!valid(kind, state, catalog)) return { ok: false, reason: 'invalid' };
  try {
    const record = { saveVersion: SAVE_VERSION, gameVersion: VERSION, kind,
      savedAt: new Date().toISOString(), state };
    (storage ?? globalThis.localStorage).setItem(SAVE_KEYS[kind], JSON.stringify(record));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'storage' };
  }
}

export function removeDraft(storage) {
  try { (storage ?? globalThis.localStorage).removeItem(SAVE_KEYS.draft); } catch { /* พื้นที่จัดเก็บอาจถูกปิด */ }
}
