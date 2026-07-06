import type { SetupState } from '../types';

export interface HistoryEntry {
  id: string;
  createdAt: number; // Unix ms timestamp
  setup: SetupState;
}

const DB_NAME = 'rallyq-db';
const STORE_NAME = 'roster-history';
const DB_VERSION = 1;
const MAX_ENTRIES = 10;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist a new history entry, trimming the oldest if over MAX_ENTRIES. */
export async function saveToHistory(setup: SetupState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getAllReq = store.index('createdAt').getAll();

    getAllReq.onsuccess = () => {
      const entries: HistoryEntry[] = getAllReq.result;
      // Sort oldest first so we can delete from the front
      entries.sort((a, b) => a.createdAt - b.createdAt);

      // Trim oldest entries to stay within MAX_ENTRIES (leave room for the new one)
      while (entries.length >= MAX_ENTRIES) {
        store.delete(entries.shift()!.id);
      }

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        setup,
      };
      store.put(entry);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Return all history entries sorted newest-first. */
export async function getHistory(): Promise<HistoryEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.index('createdAt').getAll();
    req.onsuccess = () => {
      const entries: HistoryEntry[] = req.result;
      entries.sort((a, b) => b.createdAt - a.createdAt);
      resolve(entries);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Remove a single history entry by id. */
export async function deleteFromHistory(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

