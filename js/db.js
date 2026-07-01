/**
 * IndexedDB wrapper for encounters.
 */
const DB_NAME = 'lucy-scribe';
const DB_VERSION = 1;
const STORE = 'encounters';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function requestToPromise(tx, request, result) {
  return new Promise((resolve, reject) => {
    tx.onerror = () => reject(tx.error);
    request.onsuccess = () => resolve(result !== undefined ? result : request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createId(prefix = 'enc') {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyEncounter(overrides = {}) {
  const now = Date.now();
  const base = {
    id: createId('enc'),
    title: 'New encounter',
    createdAt: now,
    updatedAt: now,
    timezone: 'Australia/Sydney',
    durationMs: 0,
    audioBlob: null,
    speakers: [],
    segments: [],
    notes: { subjective: '', objective: '', assessment: '', plan: '', freeform: '' },
    actions: [],
    insights: { summary: '', entities: [], questions: [], considerations: [] },
    settings: { language: 'en-AU', enhancedTranscription: false },
  };
  return {
    ...base,
    ...overrides,
    settings: { ...base.settings, ...overrides.settings },
    speakers: overrides.speakers ? overrides.speakers.map((s) => ({ ...s })) : base.speakers,
  };
}

export async function saveEncounter(encounter) {
  encounter.updatedAt = Date.now();
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const req = tx.objectStore(STORE).put(encounter);
  await requestToPromise(tx, req, encounter);
  return encounter;
}

export async function getEncounter(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get(id);
  return requestToPromise(tx, req);
}

export async function deleteEncounter(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const req = tx.objectStore(STORE).delete(id);
  await requestToPromise(tx, req);
}

export async function listEncounters() {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).getAll();
  const items = await requestToPromise(tx, req);
  return (items || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function searchEncounters(query) {
  const q = query.trim().toLowerCase();
  if (!q) return listEncounters();
  const all = await listEncounters();
  return all.filter((enc) => {
    const hay = [
      enc.title,
      ...(enc.segments || []).map((s) => s.text),
      enc.notes?.subjective,
      enc.notes?.objective,
      enc.notes?.assessment,
      enc.notes?.plan,
      enc.notes?.freeform,
      ...(enc.actions || []).map((a) => a.text),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export async function clearAllData() {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const req = tx.objectStore(STORE).clear();
  await requestToPromise(tx, req);
}
