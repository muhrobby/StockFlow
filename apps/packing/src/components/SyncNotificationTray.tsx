import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Camera
} from 'lucide-react';

export interface InFlightSyncItem {
  id: string;
  invNo: string;
  totalPhotos: number;
  timestamp: string;
}

export interface RecentSyncItem {
  id: string;
  invNo: string;
  totalPhotos: number;
  timestamp: string;
  timeFormatted: string;
  status: 'success' | 'error';
  message?: string;
}

interface SyncNotificationTrayProps {
  inFlightItems: InFlightSyncItem[];
  recentSyncs: RecentSyncItem[];
  onClearRecent: () => void;
}

export const SyncNotificationTray: React.FC<SyncNotificationTrayProps> = ({
  inFlightItems,
  recentSyncs,
  onClearRecent
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
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

  const totalPending = inFlightItems.length;

  return (
    <div className="relative" ref={popoverRef}>
      {/* TRIGGER BUTTON (LONCENG) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95"
        aria-label="Pusat Sinkronisasi"
        title="Pusat Sinkronisasi & Antrean"
      >
        <Bell className="h-5 w-5" />
        {totalPending > 0 && (
          <span
            className={`absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-black text-white shadow-sm ring-2 ring-white ${
              !isOnline
                ? 'bg-amber-500'
                : 'bg-blue-600 animate-pulse'
            }`}
          >
            {totalPending}
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
                  Status sinkronisasi cloud
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
            {/* SECTION 1: SEDANG BERJALAN */}
            {inFlightItems.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Sedang Berjalan
                    </span>
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-800">
                      {inFlightItems.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {inFlightItems.map((item) => (
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
                            <span>{item.totalPhotos} Foto • Mengunggah...</span>
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

            {/* SECTION 2: BARU SAJA SUKSES / RIWAYAT */}
            {recentSyncs.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Baru Saja Selesai
                  </span>
                  <button
                    type="button"
                    onClick={onClearRecent}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 active:underline"
                  >
                    Bersihkan
                  </button>
                </div>
                <div className="space-y-2">
                  {recentSyncs.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-xl border p-2.5 ${
                        item.status === 'success'
                          ? 'border-emerald-100 bg-emerald-50/40'
                          : 'border-red-100 bg-red-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${
                            item.status === 'success'
                              ? 'bg-emerald-600'
                              : 'bg-red-600'
                          }`}
                        >
                          {item.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <AlertCircle className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">
                            {item.invNo}
                          </p>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{item.timeFormatted}</span>
                            <span>•</span>
                            <span>{item.totalPhotos} Foto</span>
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ml-2 ${
                          item.status === 'success'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {item.status === 'success' ? 'Sukses' : 'Gagal'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EMPTY STATE */}
            {inFlightItems.length === 0 && recentSyncs.length === 0 && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCheck className="h-5 w-5" />
                </div>
                <h4 className="text-xs font-black text-slate-800">
                  Semua Data Tersinkron
                </h4>
                <p className="mx-auto mt-0.5 text-[11px] text-slate-400 leading-relaxed max-w-[220px]">
                  Tidak ada antrean tertunda. Dokumentasi packing aman di cloud.
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
                {isOnline ? 'Online (Terhubung)' : 'Offline (Terputus)'}
              </span>
            </div>
            <span className="text-slate-400 font-medium">
              Digital Operations Cloud
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
