import React, { useState } from 'react';
import {
  Search,
  ScanBarcode,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  FolderOpen,
  MapPin,
  User,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { searchPackingDocumentation, PackingHistoryItem } from '../services/packingApi';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { audio } from '../services/audio';

interface PackingHistoryViewProps {
  storeCode: string;
  storeAddress: string;
  recentLogs: PackingHistoryItem[];
}

export const PackingHistoryView: React.FC<PackingHistoryViewProps> = ({
  storeCode,
  storeAddress,
  recentLogs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PackingHistoryItem[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();

    const queryToUse = customQuery !== undefined ? customQuery : searchQuery;
    const cleanQuery = queryToUse.trim().toUpperCase();

    setIsSearching(true);
    setErrorMessage(null);

    try {
      const res = await searchPackingDocumentation(storeCode, cleanQuery);
      setSearchResults(res.items || []);
      if (res.items && res.items.length > 0) {
        audio.success();
      } else {
        audio.error();
      }
    } catch (err: any) {
      console.error('[PackingHistory] Error searching:', err);
      setErrorMessage(err.message || 'Gagal mencari riwayat packing.');
      audio.error();
    } finally {
      setIsSearching(false);
    }
  };

  const handleScanSuccess = (scannedResi: string) => {
    setSearchQuery(scannedResi);
    handleSearch(undefined, scannedResi);
  };

  const handleClear = () => {
    setSearchQuery('');
    setSearchResults(null);
    setErrorMessage(null);
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* SEARCH BAR WITH INTEGRATED SCANNER */}
      <form onSubmit={handleSearch} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 shadow-sm space-y-2">
        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
          Cari Nomor Resi / Invoice
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              placeholder="Ketik atau scan resi..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-sm font-bold text-slate-900 outline-none transition focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100 placeholder:text-xs sm:placeholder:text-sm placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 uppercase"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* SCAN BUTTON (SIDE-BY-SIDE) */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="h-12 w-12 shrink-0 rounded-xl bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center shadow-md shadow-red-200 transition-transform active:scale-95"
            title="Scan Barcode Resi"
          >
            <ScanBarcode className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-tighter">Scan</span>
          </button>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={isSearching}
            className="h-12 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Cari</span>}
          </button>
        </div>
      </form>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* HASIL PENCARIAN ATAU DAFTAR TERAKHIR */}
      <div className="space-y-3">
        {/* HEADER STATUS */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {searchResults !== null
              ? `Hasil Pencarian (${searchResults.length})`
              : `Dokumentasi Sesi Ini (${recentLogs.length})`}
          </span>
          {searchResults !== null && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold text-red-600 hover:text-red-700 underline"
            >
              Tampilkan Sesi Ini
            </button>
          )}
        </div>

        {/* LOADING STATE */}
        {isSearching && (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-red-600" />
            <p className="text-xs font-medium">Mencari bukti dokumentasi di {storeCode}...</p>
          </div>
        )}

        {/* EMPTY STATE SEARCH */}
        {!isSearching && searchResults !== null && searchResults.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200 space-y-2">
            <FolderOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800">Tidak Ditemukan</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Tidak ditemukan bukti dokumentasi untuk resi &quot;{searchQuery}&quot; pada cabang {storeCode}. Pastikan nomor resi benar.
            </p>
          </div>
        )}

        {/* EMPTY STATE RECENT (BELUM ADA AKTIVITAS SESI INI) */}
        {!isSearching && searchResults === null && recentLogs.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200 space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">Pencarian Dokumentasi</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Ketik atau scan nomor resi untuk memeriksa bukti dokumentasi dan melihat arsip foto.
            </p>
          </div>
        )}

        {/* LIST KARTU DOKUMENTASI */}
        {!isSearching && (
          <div className="space-y-3">
            {(searchResults !== null ? searchResults : recentLogs).map((item, idx) => (
              <div
                key={`${item.inv_no}-${idx}`}
                className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-sm space-y-3 transition-all hover:ring-slate-300"
              >
                {/* HEADER KARTU */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                      <span>{item.inv_no}</span>
                    </h3>
                    <p className="text-[11px] font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{formatDate(item.timestamp)}</span>
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold ring-1 ring-emerald-200 flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{item.total_photos || 1} Foto</span>
                  </span>
                </div>

                {/* META INFO */}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">PIC: {item.access_id || '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate justify-end">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{item.store_id || storeCode}</span>
                  </div>
                </div>

                {/* BUKTI FOTO ACTION BUTTON */}
                {item.link_google_drive ? (
                  <a
                    href={item.link_google_drive}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs ring-1 ring-red-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Lihat Foto Dokumentasi</span>
                    <ExternalLink className="w-3.5 h-3.5 text-red-400 ml-0.5" />
                  </a>
                ) : (
                  <div className="text-[11px] text-slate-400 text-center italic py-1">
                    Arsip foto sedang diproses
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
};
