import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyEncounter,
  saveEncounter,
  getEncounter,
  listEncounters,
  deleteEncounter,
  searchEncounters,
  ensureDbMigrated,
  getDbName,
  __resetDbForTests,
} from '../js/db.js';
import { STORAGE_KEYS, writeJsonStorage } from '../js/lib/storage-keys.js';

function deleteDb(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('db', () => {
  beforeEach(async () => {
    await __resetDbForTests();
    localStorage.clear();
    writeJsonStorage(STORAGE_KEYS.DB_FLAGS, {});
    await deleteDb('lucy-scribe');
    await deleteDb('tiger-scribe');
    await __resetDbForTests();
  });

  it('uses tiger-scribe database name', () => {
    expect(getDbName()).toBe('tiger-scribe');
  });

  it('saves and retrieves an encounter', async () => {
    const enc = createEmptyEncounter({ title: 'Morning clinic' });
    await saveEncounter(enc);
    const loaded = await getEncounter(enc.id);
    expect(loaded?.title).toBe('Morning clinic');
  });

  it('lists encounters newest first', async () => {
    const a = createEmptyEncounter({ title: 'A' });
    const b = createEmptyEncounter({ title: 'B' });
    await saveEncounter(a);
    await new Promise((r) => setTimeout(r, 5));
    await saveEncounter(b);
    const list = await listEncounters();
    expect(list[0].title).toBe('B');
  });

  it('deletes an encounter', async () => {
    const enc = createEmptyEncounter();
    await saveEncounter(enc);
    await deleteEncounter(enc.id);
    expect(await getEncounter(enc.id)).toBeUndefined();
  });

  it('searches transcript text', async () => {
    const enc = createEmptyEncounter({
      segments: [{ id: 's1', speakerId: 'spk-1', text: 'unique symptom keyword', startMs: 0, endMs: 1000 }],
      speakers: [{ id: 'spk-1', name: 'Patient', color: '#059669' }],
    });
    await saveEncounter(enc);
    const hits = await searchEncounters('unique symptom');
    expect(hits).toHaveLength(1);
  });

  it('migrates data from legacy lucy-scribe once', async () => {
    const legacy = createEmptyEncounter({ title: 'Legacy visit' });
    const legacyDb = await new Promise((resolve, reject) => {
      const req = indexedDB.open('lucy-scribe', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('encounters')) {
          db.createObjectStore('encounters', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = legacyDb.transaction('encounters', 'readwrite');
      tx.objectStore('encounters').put(legacy);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    legacyDb.close();

    await ensureDbMigrated();
    const list = await listEncounters();
    expect(list.some((e) => e.title === 'Legacy visit')).toBe(true);

    await ensureDbMigrated();
    const again = await listEncounters();
    expect(again.filter((e) => e.title === 'Legacy visit')).toHaveLength(1);
  });
});
