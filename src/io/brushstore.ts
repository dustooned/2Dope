/**
 * My brushes, kept in IndexedDB: picture tips and grains make brushes too big for localStorage
 * (a few megabytes, shared with everything else), which made imported brushes vanish on reload.
 */

const DB = '2dope-brushes';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

export async function loadBrushes(): Promise<unknown[] | null> {
  const db = await open();
  try {
    return await new Promise<unknown[] | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('mine');
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as unknown[]) : null);
      req.onerror = () => reject(req.error ?? new Error('read failed'));
    });
  } finally {
    db.close();
  }
}

export async function saveBrushes(list: unknown[]): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(list, 'mine');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('write aborted'));
    });
  } finally {
    db.close();
  }
}
