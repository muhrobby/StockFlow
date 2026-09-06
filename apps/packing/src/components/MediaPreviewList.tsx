import React, { useState } from 'react';
import { Camera, FileImage, Trash2, ZoomIn, X, Plus } from 'lucide-react';

interface MediaPreviewListProps {
  photos: string[];
  maxPhotos: number;
  onRemovePhoto: (index: number) => void;
  onOpenCamera: () => void;
  onOpenGallery: () => void;
}

export const MediaPreviewList: React.FC<MediaPreviewListProps> = ({
  photos,
  maxPhotos,
  onRemovePhoto,
  onOpenCamera,
  onOpenGallery,
}) => {
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  // KONDISI 0 FOTO: Tampilkan aksi awal yang bersih dan intuitif
  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-5 text-center space-y-3.5">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center ring-1 ring-red-100">
          <Camera className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Foto Dokumentasi</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Ambil 1 hingga {maxPhotos} foto dokumentasi (label resi, kondisi barang, segel lakban).
          </p>
        </div>

        <div className="space-y-2 pt-1 max-w-sm mx-auto">
          <button
            type="button"
            onClick={onOpenCamera}
            className="w-full py-3.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-200 transition-all active:scale-[0.98]"
          >
            <Camera className="w-5 h-5" />
            <span>Buka Kamera</span>
          </button>

          <button
            type="button"
            onClick={onOpenGallery}
            className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <FileImage className="w-4 h-4 text-slate-500" />
            <span>Pilih dari Galeri</span>
          </button>
        </div>
      </div>
    );
  }

  // KONDISI SUDAH ADA FOTO: Tampilkan galeri thumbnail dinamis + tombol Tambah
  return (
    <div className="space-y-3">
      {/* HEADER STRIP */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Foto Dokumentasi
        </span>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold ring-1 ring-red-200">
            {photos.length} / {maxPhotos} Foto
          </span>
          {photos.length < maxPhotos && (
            <button
              type="button"
              onClick={onOpenGallery}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline decoration-slate-300"
              title="Unggah dari galeri"
            >
              Galeri
            </button>
          )}
        </div>
      </div>

      {/* DYNAMIC PHOTO GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo, index) => (
          <div
            key={index}
            className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm group"
          >
            <img
              src={photo}
              alt={`Dokumentasi ${index + 1}`}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setZoomIndex(index)}
            />

            {/* BADGE NOMOR */}
            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold pointer-events-none">
              #{index + 1}
            </span>

            {/* ACTION TOMBOL HAPUS (TOP RIGHT) */}
            <button
              type="button"
              onClick={() => onRemovePhoto(index)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-md active:scale-95"
              title="Hapus foto ini"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* ACTION TOMBOL ZOOM (BOTTOM RIGHT) */}
            <button
              type="button"
              onClick={() => setZoomIndex(index)}
              className="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm transition-colors active:scale-95"
              title="Perbesar"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {/* KARTU TAMBAH FOTO (JIKA BELUM MENCAPAI MAKSIMAL) */}
        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={onOpenCamera}
            className="aspect-[4/3] rounded-2xl border-2 border-dashed border-red-200 hover:border-red-400 bg-red-50/40 hover:bg-red-50/80 text-red-600 flex flex-col items-center justify-center gap-1.5 font-bold text-xs transition-all active:scale-95 group"
          >
            <div className="w-9 h-9 rounded-xl bg-red-100/80 group-hover:bg-red-200 flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5 text-red-600" />
            </div>
            <span>+ Tambah Foto</span>
            <span className="text-[10px] font-medium text-slate-400">
              Sisa {maxPhotos - photos.length} slot
            </span>
          </button>
        )}
      </div>

      {/* FULLSCREEN ZOOM MODAL */}
      {zoomIndex !== null && photos[zoomIndex] && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-center items-center p-4">
          <div className="absolute top-4 right-4 z-10">
            <button
              type="button"
              onClick={() => setZoomIndex(null)}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <img
            src={photos[zoomIndex]}
            alt={`Foto ${zoomIndex + 1}`}
            className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl"
          />
          <span className="text-white text-xs font-semibold mt-3">
            Foto {zoomIndex + 1} dari {photos.length}
          </span>
        </div>
      )}
    </div>
  );
};
