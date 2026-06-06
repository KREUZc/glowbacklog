const DB_NAME = "sparks-pwa-v1";
const DB_VERSION = 1;
const STORES = {
  CAPTURES: "captures",
  MATERIALS: "materials"
};

let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  if (!globalThis.indexedDB) throw new Error("IndexedDB is not supported");

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.CAPTURES)) {
        const captures = db.createObjectStore(STORES.CAPTURES, { keyPath: "id" });
        captures.createIndex("createdAt", "createdAt");
        captures.createIndex("status", "status");
        captures.createIndex("kind", "kind");
      }
      if (!db.objectStoreNames.contains(STORES.MATERIALS)) {
        const materials = db.createObjectStore(STORES.MATERIALS, { keyPath: "id" });
        materials.createIndex("captureId", "captureId");
        materials.createIndex("type", "type");
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCaptureWithMaterials(capture, materials = []) {
  const db = await openDatabase();
  const tx = db.transaction([STORES.CAPTURES, STORES.MATERIALS], "readwrite");
  const captureStore = tx.objectStore(STORES.CAPTURES);
  const materialStore = tx.objectStore(STORES.MATERIALS);
  captureStore.put(capture);
  materials.forEach((material) => materialStore.put(material));
  await txDone(tx);
  return capture;
}

export async function updateCapture(capture) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.CAPTURES, "readwrite");
  tx.objectStore(STORES.CAPTURES).put({ ...capture, updatedAt: new Date().toISOString() });
  await txDone(tx);
}

export async function getCaptures() {
  const db = await openDatabase();
  const tx = db.transaction(STORES.CAPTURES, "readonly");
  const request = tx.objectStore(STORES.CAPTURES).getAll();
  const captures = await requestToPromise(request);
  return captures.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getCapture(id) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.CAPTURES, "readonly");
  return requestToPromise(tx.objectStore(STORES.CAPTURES).get(id));
}

export async function getMaterialsForCapture(captureId) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.MATERIALS, "readonly");
  const index = tx.objectStore(STORES.MATERIALS).index("captureId");
  return requestToPromise(index.getAll(captureId));
}

export async function clearAllData() {
  const db = await openDatabase();
  const tx = db.transaction([STORES.CAPTURES, STORES.MATERIALS], "readwrite");
  tx.objectStore(STORES.CAPTURES).clear();
  tx.objectStore(STORES.MATERIALS).clear();
  await txDone(tx);
}
