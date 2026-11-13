// Local mp3s live in this device's IndexedDB (never uploaded anywhere).
const DB = "morningtunes", STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
export const saveFile = (id: string, blob: Blob) => run("readwrite", (s) => s.put(blob, id)).then(() => undefined);
export const getFile = (id: string) => run<Blob | undefined>("readonly", (s) => s.get(id));
export const deleteFile = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);
export const listFileIds = () => run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((k) => k.map(String));
