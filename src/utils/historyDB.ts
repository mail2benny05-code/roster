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

function playerSetKey(setup: SetupState): string {
  return setup.players.map(player => player.id).sort().join('|');
}

/** Update the saved roster for this player set, or add a new entry when changed. */
export async function saveToHistory(setup: SetupState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getAllReq = store.index('createdAt').getAll();

    getAllReq.onsuccess = () => {
      const entries: HistoryEntry[] = getAllReq.result;
      const signature = playerSetKey(setup);
      const matches = entries
        .filter(entry => playerSetKey(entry.setup) === signature)
        .sort((a, b) => b.createdAt - a.createdAt);
      const existing = matches[0];
      const duplicateIds = new Set(matches.map(entry => entry.id));
      const otherEntries = entries.filter(entry => !duplicateIds.has(entry.id));

      // Collapse old duplicates for this group and update the newest entry in
      // place so re-generating the same roster does not fill the history list.
      for (const duplicate of matches.slice(1)) store.delete(duplicate.id);

      if (!existing) {
        // Sort oldest first so we can delete from the front, leaving room for
        // the new player set.
        otherEntries.sort((a, b) => a.createdAt - b.createdAt);
        while (otherEntries.length >= MAX_ENTRIES) {
          store.delete(otherEntries.shift()!.id);
        }
      }

      const entry: HistoryEntry = {
        id: existing?.id ?? crypto.randomUUID(),
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
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.index('createdAt').getAll();
    let uniqueEntries: HistoryEntry[] = [];
    req.onsuccess = () => {
      const entries: HistoryEntry[] = req.result;
      entries.sort((a, b) => b.createdAt - a.createdAt);
      const seenPlayers = new Set<string>();
      uniqueEntries = entries.filter(entry => {
        const signature = playerSetKey(entry.setup);
        if (seenPlayers.has(signature)) {
          store.delete(entry.id);
          return false;
        }
        seenPlayers.add(signature);
        return true;
      });
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(uniqueEntries);
    tx.onerror = () => reject(tx.error);
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
