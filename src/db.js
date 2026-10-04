// Local-only storage. Nothing here is ever sent to a server.
// Stores: guests, entries (feedback), bookings, messages, settings (key/value).

const DB_NAME = 'kitabu';
const DB_VERSION = 1;
const STORES = ['guests', 'entries', 'bookings', 'messages', 'settings'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  async all(store) {
    return tx(store, 'readonly', s => reqP(s.getAll()));
  },
  async get(store, id) {
    return tx(store, 'readonly', s => reqP(s.get(id)));
  },
  async put(store, value) {
    await tx(store, 'readwrite', s => { s.put(value); });
    return value;
  },
  async putMany(store, values) {
    await tx(store, 'readwrite', s => { for (const v of values) s.put(v); });
  },
  async del(store, id) {
    await tx(store, 'readwrite', s => { s.delete(id); });
  },
  async clear(store) {
    await tx(store, 'readwrite', s => { s.clear(); });
  },
  async getSetting(key, fallback = null) {
    const row = await this.get('settings', key);
    return row ? row.value : fallback;
  },
  async setSetting(key, value) {
    return this.put('settings', { key, value });
  },
  async wipeAll() {
    for (const s of STORES) await this.clear(s);
  },
};

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
