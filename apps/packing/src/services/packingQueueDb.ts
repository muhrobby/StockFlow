/**
 * packingQueueDb.ts
 * IndexedDB Persistent Queue Storage for StockFlow Packing Documentation.
 * 
 * Prinsip:
 * 1. Zero External Dependencies (Native IndexedDB) - ramah memori HP kentang.
 * 2. Zero Data Loss: Semua foto & metadata tersimpan lokal sebelum dikirim ke jaringan.
 * 3. Tahan Refresh, Crash, dan Offline: Antrean tetap tersimpan meskipun browser ditutup.
 */

export interface QueuedPackingPhoto {
  filename: string;
  data: string; // Base64 data URL
  timestamp: string;
}

export interface QueuedPackingJob {
  id: string;
  invNo: string;
  storeId: string;
  storeCode: string;
  address: string;
  accessId: string;
  userName: string;
  totalPhotos: number;
  photos: QueuedPackingPhoto[];
  timestamp: string;
  timeCreated: string;
  status: 'pending' | 'uploading' | 'synced' | 'error';
  driveFolderUrl?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  jobId?: string;
  serverStatus?: 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;
}

const DB_NAME = 'StockFlowPackingDB';
const DB_VERSION = 1;
const STORE_NAME = 'packing_queue';

let dbInstance: IDBDatabase | null = null;

/**
 * Membuka koneksi ke IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('invNo', 'invNo', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[PackingQueueDB] Gagal membuka IndexedDB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Menyimpan atau memperbarui item antrean
 */
export async function savePackingJob(job: QueuedPackingJob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({
      ...job,
      updatedAt: Date.now()
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mengambil item antrean berdasarkan ID
 */
export async function getPackingJob(id: string): Promise<QueuedPackingJob | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mengambil semua item antrean (diurutkan berdasarkan createdAt descending)
 */
export async function getAllPackingJobs(): Promise<QueuedPackingJob[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items: QueuedPackingJob[] = request.result || [];
      // Urutkan dari yang terbaru
      items.sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mengambil item yang belum tersinkron (pending, uploading, error)
 */
export async function getUnsyncedPackingJobs(): Promise<QueuedPackingJob[]> {
  const all = await getAllPackingJobs();
  return all.filter((job) => job.status !== 'synced');
}

/**
 * Update status job antrean
 */
export async function updatePackingJobStatus(
  id: string,
  status: QueuedPackingJob['status'],
  extras?: {
    driveFolderUrl?: string;
    errorMessage?: string;
    incrementRetry?: boolean;
    jobId?: string;
    serverStatus?: 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;
  }
): Promise<void> {
  const job = await getPackingJob(id);
  if (!job) return;

  job.status = status;
  job.updatedAt = Date.now();

  if (extras?.driveFolderUrl !== undefined) {
    job.driveFolderUrl = extras.driveFolderUrl;
  }
  if (extras?.errorMessage !== undefined) {
    job.errorMessage = extras.errorMessage;
  }
  if (extras?.incrementRetry) {
    job.retryCount = (job.retryCount || 0) + 1;
  }
  if (extras?.jobId !== undefined) {
    job.jobId = extras.jobId;
  }
  if (extras?.serverStatus !== undefined) {
    job.serverStatus = extras.serverStatus;
  }

  await savePackingJob(job);
}

/**
 * Hapus job dari antrean (misal dibatalkan operator)
 */
export async function deletePackingJob(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Membersihkan job yang sudah berhasil tersinkron lebih dari X hari (default 3 hari)
 * untuk menghemat penyimpanan lokal perangkat.
 */
export async function cleanupSyncedJobs(maxAgeMs = 3 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await openDB();
  const all = await getAllPackingJobs();
  const now = Date.now();
  let deletedCount = 0;

  const toDelete = all.filter(
    (job) => job.status === 'synced' && now - job.updatedAt > maxAgeMs
  );

  for (const item of toDelete) {
    await deletePackingJob(item.id);
    deletedCount++;
  }

  return deletedCount;
}
