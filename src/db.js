const DB_NAME = "scout-dispatch-board-v1";
const DB_VERSION = 2;
const TASKS = "tasks";
const PHOTOS = "photosV2";
const OLD_PHOTOS = "photos";

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TASKS)) db.createObjectStore(TASKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PHOTOS)) {
        const photos = db.createObjectStore(PHOTOS, { keyPath: "id" });
        photos.createIndex("taskId", "taskId", { unique: false });
        if (db.objectStoreNames.contains(OLD_PHOTOS)) {
          const oldStore = request.transaction.objectStore(OLD_PHOTOS);
          const cursorRequest = oldStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
              photos.put({ ...cursor.value, id: crypto.randomUUID() });
              cursor.continue();
            }
          };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name, mode = "readonly") {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function getTasks() {
  return requestPromise((await store(TASKS)).getAll());
}

export async function putTasks(items) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASKS, "readwrite");
    const taskStore = tx.objectStore(TASKS);
    items.forEach((item) => taskStore.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceTasks(items) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASKS, "readwrite");
    const taskStore = tx.objectStore(TASKS);
    taskStore.clear();
    items.forEach((item) => taskStore.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTask(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TASKS, PHOTOS], "readwrite");
    tx.objectStore(TASKS).delete(id);
    const photoStore = tx.objectStore(PHOTOS);
    const cursorRequest = photoStore.index("taskId").openCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addPhotos(taskId, files) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS, "readwrite");
    const photoStore = tx.objectStore(PHOTOS);
    [...files]
      .filter((file) => file.type.startsWith("image/"))
      .forEach((file) => photoStore.put({
        id: crypto.randomUUID(),
        taskId,
        blob: file,
        fileName: file.name,
        mimeType: file.type,
        createdAt: Date.now(),
      }));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPhotos(taskId) {
  return requestPromise((await store(PHOTOS)).index("taskId").getAll(taskId));
}

export async function getAllPhotos() {
  return requestPromise((await store(PHOTOS)).getAll());
}

export async function removePhoto(id) {
  return requestPromise((await store(PHOTOS, "readwrite")).delete(id));
}

export async function replaceAllData(tasks, photos) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TASKS, PHOTOS], "readwrite");
    const taskStore = tx.objectStore(TASKS);
    const photoStore = tx.objectStore(PHOTOS);
    taskStore.clear();
    photoStore.clear();
    tasks.forEach((task) => taskStore.put(task));
    photos.forEach((photo) => photoStore.put(photo));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAll() {
  return replaceAllData([], []);
}
