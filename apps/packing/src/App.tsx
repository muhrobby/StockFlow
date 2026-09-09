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
  SyncNotificationTray,
  InFlightSyncItem,
  RecentSyncItem
} from './components/SyncNotificationTray';
import {
  submitPackingDocumentation,
  fetchStoreInfo,
  PackingPayload,
  PackingHistoryItem
} from './services/packingApi';

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

  // SYNC NOTIFICATION TRAY STATES
  const [inFlightItems, setInFlightItems] = useState<InFlightSyncItem[]>([]);
  const [recentSyncs, setRecentSyncs] = useState<RecentSyncItem[]>(() => {
    try {
      const store = getStoreCode();
      const raw = localStorage.getItem(`packing_recent_syncs_${store}`);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  });

  // RECENT PACKED LOGS (SESI AKTIF INI)
  const [recentLogs, setRecentLogs] = useState<PackingHistoryItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const storeCode = getStoreCode();
  const [storeAddress, setStoreAddress] = useState<string>(getStoreAddress());
  const hasAccess = checkPackingAccess();

  useEffect(() => {
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
          img.onload = () => {
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
              const compressed = canvas.toDataURL('image/jpeg', 0.82);
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

  const handleClearRecentSyncs = () => {
    setRecentSyncs([]);
    try {
      localStorage.removeItem(`packing_recent_syncs_${storeCode}`);
    } catch (_) {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    const currentIsoTime = getLocalIsoTime();
    const currentPhotosCount = photos.length;
    const inFlightId = `PACK-SYNC-${Date.now()}`;

    const payload: PackingPayload = {
      id: `PACK-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      store_id: storeCode,
      store_code: storeCode,
      inv_no: cleanInv,
      timestamp: currentIsoTime,
      time_created: currentIsoTime,
      address: storeAddress,
      access_id: session?.access_id || 'OPS-GUEST',
      user_name: session?.nama || 'Petugas Packing',
      total_photos: currentPhotosCount,
      photos: photos.map((data, idx) => ({
        filename: `${cleanInv}_foto_${idx + 1}.jpg`,
        data,
        timestamp: currentIsoTime
      }))
    };

    // ZERO-WAIT OPTIMISTIC RESPONSE
    audio.success();
    setInvNo('');
    setPhotos([]);

    // Tambahkan ke daftar sedang berjalan (in-flight)
    setInFlightItems((prev) => [
      {
        id: inFlightId,
        invNo: cleanInv,
        totalPhotos: currentPhotosCount,
        timestamp: currentIsoTime
      },
      ...prev
    ]);

    // Asynchronous background upload
    try {
      const res = await submitPackingDocumentation(payload);

      // Hapus dari in-flight
      setInFlightItems((prev) => prev.filter((item) => item.id !== inFlightId));

      const now = new Date();
      const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      // Catat di recent syncs
      const syncItem: RecentSyncItem = {
        id: res.drive_folder_url || inFlightId,
        invNo: cleanInv,
        totalPhotos: currentPhotosCount,
        timestamp: currentIsoTime,
        timeFormatted,
        status: 'success'
      };

      setRecentSyncs((prev) => {
        const updated = [syncItem, ...prev].slice(0, 15);
        try {
          localStorage.setItem(`packing_recent_syncs_${storeCode}`, JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });

      // Tambahkan ke recent logs sesi ini secara instan
      const newLogItem: PackingHistoryItem = {
        store_id: storeCode,
        inv_no: cleanInv,
        address: storeAddress,
        total_photos: currentPhotosCount,
        link_google_drive: res.drive_folder_url || '',
        access_id: session?.access_id || '-',
        timestamp: currentIsoTime
      };
      setRecentLogs((prev) => [newLogItem, ...prev]);
    } catch (err: any) {
      console.error('[Packing] Background upload error:', err);
      audio.error();

      // Hapus dari in-flight
      setInFlightItems((prev) => prev.filter((item) => item.id !== inFlightId));

      const now = new Date();
      const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      const failedItem: RecentSyncItem = {
        id: inFlightId,
        invNo: cleanInv,
        totalPhotos: currentPhotosCount,
        timestamp: currentIsoTime,
        timeFormatted,
        status: 'error',
        message: 'Gagal terhubung ke server'
      };

      setRecentSyncs((prev) => {
        const updated = [failedItem, ...prev].slice(0, 15);
        try {
          localStorage.setItem(`packing_recent_syncs_${storeCode}`, JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });
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

            {/* SYNC NOTIFICATION BELL & POPOVER */}
            <SyncNotificationTray
              inFlightItems={inFlightItems}
              recentSyncs={recentSyncs}
              onClearRecent={handleClearRecentSyncs}
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
                disabled={photos.length === 0 || !invNo.trim()}
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
