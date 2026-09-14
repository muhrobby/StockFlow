import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Camera,
  RotateCcw,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { QueuedPackingJob } from '../services/packingQueueDb';

interface SyncNotificationTrayProps {
  jobs: QueuedPackingJob[];
  onRetry: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClearSynced: () => void;
}

export const SyncNotificationTray: React.FC<SyncNotificationTrayProps> = ({
  jobs,
  onRetry,
  onRemove,
  onClearSynced
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const inFlightJobs = jobs.filter((j) => j.status === 'uploading' || j.status === 'pending');
  const failedJobs = jobs.filter((j) => j.status === 'error');
  const syncedJobs = jobs.filter((j) => j.status === 'synced').slice(0, 10);

  const totalPending = inFlightJobs.length;
  const totalFailed = failedJobs.length;
  const totalAttention = totalPending + totalFailed;

  const handleRetryClick = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingId(id);
    try {
      await onRetry(id);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRemoveClick = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Hapus antrean dokumentasi ini dari memori lokal?')) {
      await onRemove(id);
    }
  };

  const formatTime = (ts: number | string) => {
    try {
      const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* TRIGGER BUTTON (LONCENG DENGAN BADGE STATUS) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95"
        aria-label="Pusat Sinkronisasi"
        title="Pusat Sinkronisasi & Antrean"
      >
        <Bell className="h-5 w-5" />
        {totalAttention > 0 && (
          <span
            className={`absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-black text-white shadow-sm ring-2 ring-white ${
              totalFailed > 0
                ? 'bg-red-600'
                : !isOnline
                ? 'bg-amber-500'
                : 'bg-blue-600 animate-pulse'
            }`}
          >
            {totalAttention}
          </span>
        )}
      </button>

      {/* POPOVER DROPDOWN */}
      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2.5 flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl sm:rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200/90 transition-all origin-top-right animate-in fade-in zoom-in-95 duration-150"
          role="region"
          aria-label="Notifikasi Sinkronisasi"
        >
          {/* PANAH CARET */}
          <div className="absolute -top-1.5 right-3.5 h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white shadow-sm" />

          {/* HEADER POPOVER */}
          <div className="relative z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 leading-tight">
                  Notifikasi & Antrean
                </h3>
                <p className="text-[10px] font-medium text-slate-400 leading-tight">
                  Status sinkronisasi & resiliensi lokal
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 active:scale-95"
              aria-label="Tutup"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* KONTEN SCROLLABLE */}
          <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4 text-xs">
            {/* SECTION 1: GAGAL / PERLU RETRY (PRIORITAS UTAMA DITAMPILKAN DI ATAS) */}
            {failedJobs.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-600">
                      Gagal Diunggah ({failedJobs.length})
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">
                    Foto tersimpan aman
                  </span>
                </div>
                <div className="space-y-2">
                  {failedJobs.map((item) => {
                    const isItemRetrying = retryingId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-red-200 bg-red-50/70 p-3 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white mt-0.5">
                              <AlertCircle className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">
                                {item.invNo}
                              </p>
                              <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Camera className="h-3 w-3 text-slate-400" />
                                <span>{item.totalPhotos} Foto tersimpan</span>
                                <span>•</span>
                                <span>{formatTime(item.createdAt)}</span>
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleRemoveClick(item.id, e)}
                            className="text-slate-400 hover:text-red-600 p-1 transition"
                            title="Hapus dari antrean"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {item.errorMessage && (
                          <div className="mt-2 rounded-lg bg-red-100/70 px-2.5 py-1 text-[10px] font-medium text-red-800 leading-tight">
                            {item.errorMessage}
                          </div>
                        )}

                        {/* TOMBOL COBA LAGI (RETRY) */}
                        <div className="mt-2.5 pt-2 border-t border-red-200/60 flex items-center justify-between">
                          <span className="text-[10px] text-red-600 font-semibold">
                            {item.retryCount > 0 ? `Sudah coba ${item.retryCount}x` : 'Belum berhasil'}
                          </span>
                          <button
                            type="button"
                            disabled={isItemRetrying}
                            onClick={(e) => handleRetryClick(item.id, e)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-red-200 hover:bg-red-700 active:scale-95 disabled:bg-slate-300 transition-all"
                          >
                            <RotateCcw className={`h-3 w-3 ${isItemRetrying ? 'animate-spin' : ''}`} />
                            <span>{isItemRetrying ? 'Mencoba...' : 'Coba Lagi'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION 2: SEDANG BERJALAN (IN-FLIGHT) */}
            {inFlightJobs.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                      Sedang Diunggah ({inFlightJobs.length})
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {inFlightJobs.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 p-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">
                            {item.invNo}
                          </p>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Camera className="h-3 w-3 text-slate-400" />
                            <span>{item.totalPhotos} Foto • Mengunggah ke Drive...</span>
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-200/70 px-2 py-0.5 text-[10px] font-bold text-blue-900 shrink-0 ml-2">
                        Proses
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 3: BARU SAJA SELESAI (SYNCED) */}
            {syncedJobs.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Baru Saja Selesai
                  </span>
                  <button
                    type="button"
                    onClick={onClearSynced}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 active:underline"
                  >
                    Bersihkan
                  </button>
                </div>
                <div className="space-y-2">
                  {syncedJobs.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">
                            {item.invNo}
                          </p>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{formatTime(item.updatedAt || item.createdAt)}</span>
                            <span>•</span>
                            <span>{item.totalPhotos} Foto</span>
                            {item.serverStatus === 'PROCESSING' && (
                              <span className="text-amber-600 font-semibold">
                                • Memproses stempel...
                              </span>
                            )}
                            {item.serverStatus === 'COMPLETED' && (
                              <span className="text-emerald-700 font-semibold">
                                • Berstempel Resmi
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {item.driveFolderUrl ? (
                        <a
                          href={item.driveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-200 shrink-0 ml-2 transition"
                          title="Buka Folder di Google Drive"
                        >
                          <span>Drive</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shrink-0 ml-2">
                          Sukses
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EMPTY STATE */}
            {inFlightJobs.length === 0 && failedJobs.length === 0 && syncedJobs.length === 0 && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCheck className="h-5 w-5" />
                </div>
                <h4 className="text-xs font-black text-slate-800">
                  Semua Data Tersinkron
                </h4>
                <p className="mx-auto mt-0.5 text-[11px] text-slate-400 leading-relaxed max-w-[220px]">
                  Tidak ada antrean tertunda. Dokumentasi packing aman di cloud dan IndexedDB.
                </p>
              </div>
            )}
          </div>

          {/* FOOTER POPOVER */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span
                className={`font-bold ${
                  isOnline ? 'text-slate-600' : 'text-amber-600'
                }`}
              >
                {isOnline ? 'Online (Terhubung)' : 'Offline (Tersimpan Lokal)'}
              </span>
            </div>
            <span className="text-slate-400 font-medium">
              StockFlow Resilient Queue
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
