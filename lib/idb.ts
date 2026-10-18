"use client";

/**
 * Minimal IndexedDB key-value store. IndexedDB holds far more than
 * localStorage, stores Sets and arrays natively (structured clone) and doesn't
 * block the page while writing. Every call degrades to a no-op when storage
 * is unavailable (private mode, blocked site data).
 */
const DB = "pipewright";
const STORE = "tables";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const idbGet = <T,>(key: string) => run<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
export const idbSet = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key));
export const idbDelete = (key: string) => run("readwrite", (s) => s.delete(key));
export const idbKeys = () => run<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
