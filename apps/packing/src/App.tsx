import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutGrid,
  PackageCheck,
  History,
  Volume2,
  VolumeX,
  UploadCloud,
  ShieldAlert,
  ScanBarcode,
  X
} from 'lucide-react';
import {
  getCurrentSession,
  getStoreCode,
  getStoreAddress,
  setCachedStoreAddress,
  checkPackingAccess
} from './services/auth';
import { audio } from './services/audio';
import { ContinuousCameraModal } from './components/ContinuousCameraModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { MediaPreviewList } from './components/MediaPreviewList';
import { PackingHistoryView } from './components/PackingHistoryView';
import {
  SyncNotificationTray
} from './components/SyncNotificationTray';
import {
  fetchStoreInfo,
  PackingHistoryItem
} from './services/packingApi';
import { packingQueueManager } from './services/packingQueueManager';
import { QueuedPackingJob, cleanupSyncedJobs } from './services/packingQueueDb';
import { applyCanvasWatermark, formatStampTime } from './services/watermark';

const MAX_PHOTOS = 6;

export const App: React.FC = () => {
  const [session, setSession] = useState(getCurrentSession());
  const [isAudioActive, setIsAudioActive] = useState(audio.isEnabled());
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');

  // FORM STATES (TAB DOKUMENTASI)
  const [invNo, setInvNo] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  // PERSISTENT INDEXEDDB RESILIENT QUEUE STATES
  const [jobs, setJobs] = useState<QueuedPackingJob[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const storeCode = getStoreCode();
  const [storeAddress, setStoreAddress] = useState<string>(getStoreAddress());
  const hasAccess = checkPackingAccess();

  useEffect(() => {
    // Inisialisasi Queue Manager & langganan perubahan antrean IndexedDB
    packingQueueManager.init().then((initialJobs) => setJobs(initialJobs));
    const unsubscribe = packingQueueManager.subscribe((updatedJobs) => {
      setJobs(updatedJobs);
    });

    // Refresh session on mount
    setSession(getCurrentSession());

    // Ambil alamat toko resmi dari DB_MASTER -> stores
    let isMounted = true;
    fetchStoreInfo(storeCode)
      .then((res) => {
        if (isMounted && res.address) {
          setStoreAddress(res.address);
          setCachedStoreAddress(storeCode, res.address);
        }
      })
      .catch((err) => {
        console.warn('[PackingApp] Gagal memuat alamat resmi toko dari DB_MASTER:', err);
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [storeCode]);

  const handleToggleAudio = async () => {
    const active = await audio.toggle();
    setIsAudioActive(active);
  };

  const handleAddPhoto = (dataUrl: string) => {
    if (photos.length >= MAX_PHOTOS) return;
    setPhotos((prev) => [...prev, dataUrl]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    audio.success();
  };

  const handleBarcodeScanSuccess = (scannedResi: string) => {
    setInvNo(scannedResi);
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = MAX_PHOTOS - photos.length;
    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const result = loadEvt.target?.result as string;
        if (result) {
          // Kompresi canvas ringan di browser jika resolusi terlalu tinggi
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const maxWidth = 1280;
            let w = img.width;
            let h = img.height;
            if (w > maxWidth) {
              h = Math.round((h * maxWidth) / w);
              w = maxWidth;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);

              // BUBURKAN STEMPEL RESMI & LOGO PADA FOTO GALERI
              await applyCanvasWatermark(canvas, {
                address: storeAddress,
                timestamp: formatStampTime(new Date()),
                invNo: invNo.trim().toUpperCase() || undefined,
                accessId: session?.access_id
              });

              // Kualitas JPEG 0.85 menghasilkan gambar jernih dan hemat bandwidth (~120-180 KB)
              const compressed = canvas.toDataURL('image/jpeg', 0.85);
              handleAddPhoto(compressed);
            } else {
              handleAddPhoto(result);
            }
          };
          img.src = result;
        }
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // FORMAT TIMESTAMP ISO 8601 DENGAN TIMEZONE LOKAL (+07:00)
  const getLocalIsoTime = () => {
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const diffHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const diffMinutes = String(Math.abs(offset) % 60).padStart(2, '0');
    const sign = offset >= 0 ? '+' : '-';
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}${sign}${diffHours}:${diffMinutes}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanInv = invNo.trim().toUpperCase();
    if (!cleanInv) {
      audio.error();
      alert('Mohon masukkan atau scan Nomor Resi / Invoice terlebih dahulu.');
      return;
    }

    if (photos.length === 0) {
      audio.error();
      alert('Mohon sertakan minimal 1 foto dokumentasi.');
      return;
    }

    if (packingQueueManager.isInvoiceProcessing(cleanInv)) {
      audio.error();
      alert(`Nomor Resi / Invoice ${cleanInv} sedang dalam proses unggah ke server. Mohon tunggu sejenak.`);
      return;
    }

    setIsSubmitting(true);
    const currentIsoTime = getLocalIsoTime();
    const currentPhotosCount = photos.length;
    const currentPhotos = [...photos];

    // ZERO-WAIT OPTIMISTIC RESPONSE: Form seketika di-reset agar operator langsung proses paket berikutnya
    audio.success();
    setInvNo('');
    setPhotos([]);

    try {
      await packingQueueManager.enqueueJob({
        id: `PACK-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        storeId: storeCode,
        storeCode: storeCode,
        invNo: cleanInv,
        timestamp: currentIsoTime,
        timeCreated: currentIsoTime,
        address: storeAddress,
        accessId: session?.access_id || 'OPS-GUEST',
        userName: session?.nama || 'Petugas Packing',
        totalPhotos: currentPhotosCount,
        photos: currentPhotos.map((data, idx) => ({
          filename: `${cleanInv}_foto_${idx + 1}.jpg`,
          data,
          timestamp: currentIsoTime
        }))
      });
    } catch (err: any) {
      console.error('[Packing] Gagal memasukkan dokumentasi ke antrean:', err);
      audio.error();
      alert(err?.message || 'Gagal menyimpan antrean dokumentasi packing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // IF NO ACCESS OR NO SESSION
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full ring-1 ring-slate-200 text-center shadow-lg">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center ring-1 ring-amber-100">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Sesi Belum Aktif</h2>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Silakan masuk melalui Portal Operasional untuk menggunakan modul Packing.
          </p>
          <a
            href="/"
            className="flex items-center justify-center w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-red-200 transition-all"
          >
            Buka Portal Utama
          </a>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full ring-1 ring-slate-200 text-center shadow-lg">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center ring-1 ring-red-100">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Akses Dibatasi</h2>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Akun Anda ({session.access_id}) tidak memiliki izin untuk modul Packing.
          </p>
          <a
            href="/"
            className="flex items-center justify-center w-full h-12 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-2xl transition-all"
          >
            Kembali ke Portal
          </a>
        </div>
      </div>
    );
  }

  // RECENT PACKED LOGS DARI INDEXEDDB (SYNCED JOBS)
  const recentLogs: PackingHistoryItem[] = jobs
    .filter((j) => j.status === 'synced')
    .map((j) => ({
      store_id: j.storeId,
      inv_no: j.invNo,
      address: j.address,
      total_photos: j.totalPhotos,
      link_google_drive: j.driveFolderUrl || '',
      access_id: j.accessId,
      timestamp: j.timestamp
    }));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased font-sans pb-28">
      {/* TOP APP HEADER (SERAGAM DENGAN STOCKFLOW & PORTAL) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          {/* SISI KIRI: IDENTITAS APLIKASI */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-sm shadow-red-200">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">Dokumentasi Packing</h1>
              <p className="text-xs font-medium text-slate-500">
                {storeCode} • {session.nama}
              </p>
            </div>
          </div>

          {/* SISI KANAN: AKSI SERAGAM [PORTAL] -> [AUDIO] -> [LONCENG] */}
          <div className="flex items-center gap-2">
            {/* PORTAL UTAMA BUTTON */}
            <a
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95"
              title="Buka Portal Utama"
              aria-label="Kembali ke Portal"
            >
              <LayoutGrid className="w-5 h-5" />
            </a>

            {/* AUDIO TOGGLE BUTTON */}
            <button
              type="button"
              onClick={handleToggleAudio}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95"
              title={isAudioActive ? 'Suara Shutter: Aktif (Klik untuk bisukan)' : 'Suara Shutter: Bisu (Klik untuk aktifkan)'}
              aria-label="Beralih Suara"
            >
              {isAudioActive ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            </button>

            {/* SYNC NOTIFICATION BELL & POPOVER DENGAN RESILIENT RETRY ENGINE */}
            <SyncNotificationTray
              jobs={jobs}
              onRetry={(id) => packingQueueManager.retryJob(id)}
              onRemove={(id) => packingQueueManager.removeJob(id)}
              onClearSynced={() => cleanupSyncedJobs(0)}
            />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 space-y-4">
        {activeTab === 'create' ? (
          /* TAB 1: FORM DOKUMENTASI PACKING BARU */
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 ring-1 ring-slate-200 shadow-sm space-y-5">
            {/* INVOICE / RESI INPUT WITH SIDE-BY-SIDE SCAN BUTTON */}
            <div>
              <label htmlFor="invInput" className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                Nomor Resi / Invoice
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="invInput"
                    type="text"
                    required
                    value={invNo}
                    onChange={(e) => setInvNo(e.target.value.toUpperCase())}
                    placeholder="Ketik atau scan resi..."
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-10 text-base font-bold text-slate-900 outline-none transition focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100 placeholder:text-sm placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 uppercase"
                  />
                  {invNo && (
                    <button
                      type="button"
                      onClick={() => setInvNo('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      title="Bersihkan input"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* SCAN BUTTON (56px x 56px ERGONOMIS JEMPOL) */}
                <button
                  type="button"
                  onClick={() => setIsBarcodeScannerOpen(true)}
                  className="h-14 w-14 shrink-0 rounded-2xl bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center shadow-md shadow-red-200 transition-transform active:scale-95"
                  title="Scan Barcode Resi Pengiriman"
                >
                  <ScanBarcode className="w-6 h-6" />
                  <span className="text-[9px] font-black uppercase tracking-tighter">Scan</span>
                </button>
              </div>
            </div>

            {/* DYNAMIC MEDIA PREVIEW / CAMERA SECTION */}
            <MediaPreviewList
              photos={photos}
              maxPhotos={MAX_PHOTOS}
              onRemovePhoto={handleRemovePhoto}
              onOpenCamera={() => setIsCameraOpen(true)}
              onOpenGallery={() => fileInputRef.current?.click()}
            />

            {/* HIDDEN FILE INPUT UNTUK GALERI */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleGalleryUpload}
              className="hidden"
            />

            {/* SUBMIT BUTTON */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={photos.length === 0 || !invNo.trim() || isSubmitting}
                className="h-14 w-full rounded-2xl font-bold text-sm text-white shadow-lg shadow-red-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed bg-red-600 hover:bg-red-700"
              >
                <UploadCloud className="w-5 h-5" />
                <span>Simpan Dokumentasi Packing</span>
              </button>
            </div>
          </form>
        ) : (
          /* TAB 2: RIWAYAT & PENCARIAN HASIL DOKUMENTASI */
          <PackingHistoryView
            storeCode={storeCode}
            storeAddress={storeAddress}
            recentLogs={recentLogs}
          />
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-2 shadow-lg">
        <div className="max-w-xl mx-auto grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all active:scale-95 ${
              activeTab === 'create'
                ? 'text-red-600 font-bold bg-red-50/80 ring-1 ring-red-100'
                : 'text-slate-400 font-semibold hover:text-slate-600'
            }`}
          >
            <PackageCheck className="w-5 h-5" />
            <span className="text-xs">Dokumentasi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all active:scale-95 ${
              activeTab === 'history'
                ? 'text-red-600 font-bold bg-red-50/80 ring-1 ring-red-100'
                : 'text-slate-400 font-semibold hover:text-slate-600'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-xs">Riwayat</span>
          </button>
        </div>
      </nav>

      {/* CONTINUOUS CAMERA MODAL (FOTO PAKET) */}
      <ContinuousCameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onAddPhoto={handleAddPhoto}
        currentCount={photos.length}
        maxCount={MAX_PHOTOS}
        address={storeAddress}
        accessId={session?.access_id}
        invNo={invNo}
      />

      {/* BARCODE SCANNER MODAL (SCAN RESI / INVOICE) */}
      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScanSuccess={handleBarcodeScanSuccess}
      />
    </div>
  );
};

export default App;
