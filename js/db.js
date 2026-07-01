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

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export function createId(prefix = 'enc') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createEmptyEncounter(overrides = {}) {
  const now = Date.now();
  return {
    id: createId('enc'),
    title: 'New encounter',
    createdAt: now,
    updatedAt: now,
    timezone: overrides.timezone || 'Australia/Sydney',
    durationMs: 0,
    audioBlob: null,
    speakers: overrides.speakers || [],
    segments: [],
    notes: { subjective: '', objective: '', assessment: '', plan: '', freeform: '' },
    actions: [],
    insights: { summary: '', entities: [], questions: [], considerations: [] },
    settings: {
      language: overrides.language || 'en-AU',
      enhancedTranscription: false,
    },
    ...overrides,
  };
}

export async function saveEncounter(encounter) {
  encounter.updatedAt = Date.now();
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(encounter);
    req.onsuccess = () => resolve(encounter);
    req.onerror = () => reject(req.error);
  });
}

export async function getEncounter(id) {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEncounter(id) {
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listEncounters() {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []).sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
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
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
