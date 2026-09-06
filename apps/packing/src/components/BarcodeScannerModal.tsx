import React, { useEffect, useRef, useState } from 'react';
import { X, Flashlight, AlertCircle, Loader2 } from 'lucide-react';
import { loadHtml5Qrcode } from '../services/barcodeScanner';
import { audio } from '../services/audio';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const scannerRef = useRef<any>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      cleanupScanner();
      return;
    }

    startScanner();

    return () => {
      cleanupScanner();
    };
  }, [isOpen]);

  const startScanner = async () => {
    setLoading(true);
    setError(null);
    isStoppingRef.current = false;

    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      const readerElement = document.getElementById('barcodeScannerReader');
      if (!readerElement) {
        throw new Error('Elemen reader scanner tidak ditemukan.');
      }

      const html5QrCode = new Html5Qrcode('barcodeScannerReader');
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.min(viewfinderWidth * 0.85, 320);
          const height = Math.min(viewfinderHeight * 0.5, 180);
          return { width, height };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText: string) => {
          if (isStoppingRef.current) return;
          isStoppingRef.current = true;

          // Haptic Feedback & Audio Beep
          if (navigator.vibrate) {
            navigator.vibrate([60, 40, 60]);
          }
          audio.success();

          const cleanText = decodedText.trim().toUpperCase();
          cleanupScanner().finally(() => {
            onScanSuccess(cleanText);
            onClose();
          });
        },
        () => {
          // Frame scanner ignore
        }
      );

      // Cek ketersediaan Flashlight / Torch
      try {
        const stream = (html5QrCode as any).localMediaStream;
        if (stream) {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            trackRef.current = videoTrack;
            const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
            if ('torch' in capabilities) {
              setHasTorch(true);
            }
          }
        }
      } catch (_) {}

      setLoading(false);
    } catch (err: any) {
      console.error('[BarcodeScanner] Gagal membuka kamera:', err);
      setError(err.message || 'Izin kamera ditolak atau scanner tidak dapat dijalankan.');
      setLoading(false);
      audio.error();
    }
  };

  const cleanupScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (_) {
      } finally {
        scannerRef.current = null;
        trackRef.current = null;
        setIsTorchOn(false);
      }
    }
  };

  const toggleTorch = async () => {
    if (!trackRef.current) return;
    try {
      const nextState = !isTorchOn;
      await (trackRef.current as any).applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('[BarcodeScanner] Gagal mengubah senter:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none font-sans touch-none">
      {/* HEADER TOP BAR */}
      <div className="relative z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/90 to-transparent">
        <div>
          <h2 className="text-white text-base font-bold leading-tight">Scan Barcode Resi</h2>
          <p className="text-slate-400 text-xs">Arahkan kamera ke barcode resi / invoice</p>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isTorchOn ? 'bg-amber-400 text-black' : 'bg-white/20 text-white'
              }`}
              title="Senter"
            >
              <Flashlight className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center active:scale-95 transition-all"
            title="Tutup Scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* VIEWFINDER CONTAINER */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white bg-black/80 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            <p className="text-xs font-medium text-slate-300">Menyiapkan scanner barcode...</p>
          </div>
        )}

        {error ? (
          <div className="p-6 max-w-sm text-center text-white z-20">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h4 className="font-bold text-base mb-1">Gagal Membuka Scanner</h4>
            <p className="text-xs text-slate-300 mb-4">{error}</p>
            <button
              type="button"
              onClick={startScanner}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg"
            >
              Coba Lagi
            </button>
          </div>
        ) : (
          <div id="barcodeScannerReader" className="w-full h-full flex items-center justify-center" />
        )}

        {/* SCANNER RETICLE / LASER GUIDES OVERLAY */}
        {!loading && !error && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Box Target */}
            <div className="w-[85vw] max-w-xs h-44 rounded-2xl border-2 border-red-500/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] relative overflow-hidden flex items-center justify-center">
              {/* Animated Laser Line */}
              <div className="w-full h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />
              {/* Corner Accents */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl-lg" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr-lg" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl-lg" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white rounded-br-lg" />
            </div>
            <p className="text-white/80 text-xs font-medium mt-4 bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-sm">
              Posisikan barcode di dalam kotak merah
            </p>
          </div>
        )}
      </div>

      {/* FOOTER HINT */}
      <div className="p-4 bg-gradient-to-t from-black/90 to-transparent text-center text-[11px] text-slate-400">
        Mendukung Code 128, Code 39, QR Code (Resi J&T, SiCepat, Shopee Xpress, JNE, NinjaVan)
      </div>
    </div>
  );
};
