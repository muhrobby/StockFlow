/**
 * packingQueueManager.ts
 * Background Queue Manager & Resilience Engine for StockFlow Packing Documentation.
 * 
 * Fitur:
 * 1. Zero Data Loss: Menyimpan pekerjaan ke IndexedDB sebelum pengiriman jaringan.
 * 2. Concurrency & Dedup Lock: Mencegah duplicate submissions untuk invoice yang sama.
 * 3. Auto-Sync On Online: Otomatis memproses antrean pending/error saat koneksi pulih.
 * 4. Resilient Retry: Retry manual tanpa foto ulang kapan saja.
 * 5. Event-Driven: Memberikan update real-time ke UI komponen.
 */

import {
  QueuedPackingJob,
  savePackingJob,
  getPackingJob,
  getAllPackingJobs,
  updatePackingJobStatus,
  deletePackingJob,
  cleanupSyncedJobs
} from './packingQueueDb';
import {
  submitPackingDocumentation,
  checkPackingJobStatus,
  PackingPayload
} from './packingApi';
import { audio } from './audio';

type QueueChangeListener = (jobs: QueuedPackingJob[]) => void;

class PackingQueueManager {
  private activeUploads = new Set<string>(); // Set of job IDs currently uploading
  private activeInvoices = new Set<string>(); // Set of uppercase invNo currently uploading
  private listeners: QueueChangeListener[] = [];
  private isProcessingQueue = false;
  private isInitialized = false;

  constructor() {
    // Jalankan inisialisasi di browser environment
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[QueueManager] Koneksi pulih (Online), memproses antrean...');
        this.processPendingQueue();
      });
    }
  }

  /**
   * Inisialisasi awal saat aplikasi dimuat
   */
  public async init(): Promise<QueuedPackingJob[]> {
    if (!this.isInitialized) {
      this.isInitialized = true;
      // Bersihkan riwayat sukses yang sudah lebih dari 3 hari
      cleanupSyncedJobs().catch((err) =>
        console.warn('[QueueManager] Gagal membersihkan log usang:', err)
      );
      // Cek apakah ada antrean pending/uploading yang tertinggal akibat refresh/crash
      await this.recoverInterruptedJobs();
    }
    return this.getAllJobs();
  }

  /**
   * Pulihkan job yang statusnya 'uploading' saat app tertutup/crash menjadi 'pending'
   */
  private async recoverInterruptedJobs(): Promise<void> {
    const jobs = await getAllPackingJobs();
    for (const job of jobs) {
      if (job.status === 'uploading') {
        await updatePackingJobStatus(job.id, 'pending', {
          errorMessage: 'Pengunggahan terhenti sebelum selesai (aplikasi dimuat ulang).'
        });
      }
    }
    this.notifyListeners();
  }

  /**
   * Daftarkan listener untuk pembaruan antrean
   */
  public subscribe(listener: QueueChangeListener): () => void {
    this.listeners.push(listener);
    // Berikan data terbaru langsung
    this.getAllJobs().then((jobs) => listener(jobs));

    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private async notifyListeners(): Promise<void> {
    const jobs = await this.getAllJobs();
    this.listeners.forEach((listener) => {
      try {
        listener(jobs);
      } catch (err) {
        console.error('[QueueManager] Error in queue listener:', err);
      }
    });
  }

  public async getAllJobs(): Promise<QueuedPackingJob[]> {
    return getAllPackingJobs();
  }

  /**
   * Periksa apakah nomor invoice sedang dalam proses upload
   */
  public isInvoiceProcessing(invNo: string): boolean {
    const cleanInv = invNo.trim().toUpperCase();
    return this.activeInvoices.has(cleanInv);
  }

  /**
   * Masukkan job packing baru ke antrean (Optimistic Persistence)
   */
  public async enqueueJob(
    jobData: Omit<QueuedPackingJob, 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>
  ): Promise<QueuedPackingJob> {
    const cleanInv = jobData.invNo.trim().toUpperCase();

    // Cek duplikasi in-flight invoice
    if (this.activeInvoices.has(cleanInv)) {
      throw new Error(`Invoice ${cleanInv} sedang dalam proses pengunggahan. Mohon tunggu sejenak.`);
    }

    const now = Date.now();
    const job: QueuedPackingJob = {
      ...jobData,
      invNo: cleanInv,
      status: 'pending',
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };

    // 1. SIMPAN SEGERA KE INDEXEDDB (ZERO DATA LOSS)
    await savePackingJob(job);
    await this.notifyListeners();

    // 2. PICU PROSES UPLOAD DI LATAR BELAKANG
    this.processJob(job).catch((err) => {
      console.error(`[QueueManager] Gagal memproses job ${job.id}:`, err);
    });

    return job;
  }

  /**
   * Proses unggah spesifik untuk 1 job
   */
  public async processJob(job: QueuedPackingJob): Promise<void> {
    if (this.activeUploads.has(job.id)) {
      console.warn(`[QueueManager] Job ${job.id} sudah aktif berjalan.`);
      return;
    }

    const cleanInv = job.invNo.trim().toUpperCase();
    this.activeUploads.add(job.id);
    this.activeInvoices.add(cleanInv);

    try {
      await updatePackingJobStatus(job.id, 'uploading');
      await this.notifyListeners();

      // Buat payload untuk n8n
      const payload: PackingPayload = {
        id: job.id,
        store_id: job.storeId,
        store_code: job.storeCode,
        inv_no: cleanInv,
        timestamp: job.timestamp,
        time_created: job.timeCreated,
        address: job.address,
        access_id: job.accessId,
        user_name: job.userName,
        total_photos: job.totalPhotos,
        photos: job.photos.map((p) => ({
          filename: p.filename,
          data: p.data,
          timestamp: p.timestamp
        }))
      };

      const result = await submitPackingDocumentation(payload);
      const serverJobId = result.job_id || job.id;
      const initialServerStatus = result.status || 'PROCESSING';

      // Berhasil diterima server (Early Ack ~2s)
      await updatePackingJobStatus(job.id, 'synced', {
        driveFolderUrl: result.drive_folder_url,
        errorMessage: undefined,
        jobId: serverJobId,
        serverStatus: initialServerStatus
      });

      console.log(`[QueueManager] Job ${job.id} (${cleanInv}) sukses diterima server, memulai status polling...`);
      this.pollJobStatus(job.id, serverJobId);
    } catch (err: any) {
      console.error(`[QueueManager] Error uploading job ${job.id}:`, err);
      audio.error();

      const errMsg = err?.message || 'Gagal terhubung ke server atau timeout.';
      await updatePackingJobStatus(job.id, 'error', {
        errorMessage: errMsg,
        incrementRetry: true
      });
    } finally {
      this.activeUploads.delete(job.id);
      this.activeInvoices.delete(cleanInv);
      await this.notifyListeners();
    }
  }

  /**
   * Polling status berkala ke Redis via n8n (Live Observability)
   */
  private pollJobStatus(localJobId: string, serverJobId: string, attempt = 1, maxAttempts = 15): void {
    if (!serverJobId || attempt > maxAttempts) return;

    setTimeout(async () => {
      try {
        const statusRes = await checkPackingJobStatus(serverJobId);
        if (statusRes.success) {
          const currentStatus = statusRes.status;
          await updatePackingJobStatus(localJobId, 'synced', {
            serverStatus: currentStatus,
            driveFolderUrl: statusRes.drive_folder_url
          });
          await this.notifyListeners();

          if (currentStatus === 'COMPLETED') {
            console.log(`[QueueManager] Job ${localJobId} selesai berstempel resmi di Google Drive.`);
            audio.success();
            return;
          } else if (currentStatus === 'FAILED') {
            console.warn(`[QueueManager] Job ${localJobId} gagal diproses di server.`);
            audio.error();
            return;
          }
        }

        // Lanjutkan polling jika masih dalam antrean/processing
        this.pollJobStatus(localJobId, serverJobId, attempt + 1, maxAttempts);
      } catch (e) {
        console.warn(`[QueueManager] Gagal memeriksa status job ${serverJobId} (attempt ${attempt}):`, e);
        this.pollJobStatus(localJobId, serverJobId, attempt + 1, maxAttempts);
      }
    }, 3500);
  }

  /**
   * Coba lagi pengunggahan job yang gagal (Retry)
   */
  public async retryJob(id: string): Promise<void> {
    const job = await getPackingJob(id);
    if (!job) {
      throw new Error('Data dokumentasi tidak ditemukan di penyimpanan lokal.');
    }

    if (this.activeUploads.has(job.id)) {
      console.warn(`[QueueManager] Job ${job.id} sedang berjalan.`);
      return;
    }

    await this.processJob(job);
  }

  /**
   * Hapus job dari antrean
   */
  public async removeJob(id: string): Promise<void> {
    if (this.activeUploads.has(id)) {
      throw new Error('Tidak dapat menghapus item yang sedang dalam proses unggah.');
    }
    await deletePackingJob(id);
    await this.notifyListeners();
  }

  /**
   * Proses semua antrean pending / error jika online
   */
  public async processPendingQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[QueueManager] Perangkat offline, menunda proses antrean.');
      return;
    }

    this.isProcessingQueue = true;
    try {
      const allJobs = await getAllPackingJobs();
      const pendingJobs = allJobs.filter((j) => j.status === 'pending');

      for (const job of pendingJobs) {
        if (!this.activeUploads.has(job.id)) {
          await this.processJob(job);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }
}

export const packingQueueManager = new PackingQueueManager();
