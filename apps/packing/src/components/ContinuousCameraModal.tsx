import React, { useRef, useState, useEffect } from 'react';
import { Camera, Check, X, RotateCcw, AlertCircle } from 'lucide-react';
import { audio } from '../services/audio';
import {
  applyCanvasWatermark,
  getLiveStampTime,
  LOGO_ASSET_URL,
  preloadLogoImage
} from '../services/watermark';

interface ContinuousCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPhoto: (dataUrl: string) => void;
  currentCount: number;
  maxCount: number;
  address?: string;
  accessId?: string;
  invNo?: string;
}

export const ContinuousCameraModal: React.FC<ContinuousCameraModalProps> = ({
  isOpen,
  onClose,
  onAddPhoto,
  currentCount,
  maxCount,
  address,
  accessId,
  invNo,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [liveTime, setLiveTime] = useState<string>(getLiveStampTime());

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setLastPhoto(null);
      return;
    }

    preloadLogoImage().catch(() => {});
    startCamera();

    // Jam berdetak setiap detik secara real-time pada live HUD
    const timer = setInterval(() => {
      setLiveTime(getLiveStampTime());
    }, 1000);

    return () => {
      clearInterval(timer);
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('[ContinuousCamera] Gagal mengakses kamera:', err);
      setCameraError(err.message || 'Izin kamera ditolak atau kamera tidak tersedia.');
      audio.error();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleCapture = async () => {
    if (currentCount >= maxCount) {
      audio.error();
      return;
    }

    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');

    // Optimasi ukuran canvas untuk smartphone gudang: 1280px max width
    const maxWidth = 1280;
    let w = video.videoWidth || 1280;
    let h = video.videoHeight || 720;
    if (w > maxWidth) {
      h = Math.round((h * maxWidth) / w);
      w = maxWidth;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Gambar frame kamera aktual
    ctx.drawImage(video, 0, 0, w, h);

    // BUBURKAN STEMPEL RESMI & LOGO LANGSUNG KE CANVAS (<10 ms)
    const currentCaptureTime = getLiveStampTime();
    await applyCanvasWatermark(canvas, {
      address: address || 'Gudang Operasional StockFlow',
      timestamp: currentCaptureTime,
      accessId,
      invNo
    });

    // Kualitas JPEG 0.85 menghasilkan gambar tajam dan hemat bandwidth (~120-180 KB)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Audio & Visual flash feedback
    audio.shutter();
    setIsFlashing(true);
    setLastPhoto(dataUrl);
    setTimeout(() => setIsFlashing(false), 100);

    onAddPhoto(dataUrl);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none touch-none font-sans">
      {/* FLASH OVERLAY */}
      {isFlashing && (
        <div className="absolute inset-0 z-40 bg-white opacity-80 pointer-events-none transition-opacity duration-75" />
      )}

      {/* TOP BAR */}
      <div className="relative z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center space-x-2">
          <span className="px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold tracking-wider ring-1 ring-white/20">
            {currentCount} / {maxCount} Foto
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={toggleFacingMode}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center active:scale-95 transition-transform"
            title="Balik Kamera"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center active:scale-95 transition-transform"
            title="Tutup Kamera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* CAMERA VIEWFINDER DENGAN LIVE HUD OVERLAY */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="text-center p-6 max-w-sm text-white">
            <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
            <h4 className="font-bold text-base mb-1">Kamera Tidak Tersedia</h4>
            <p className="text-xs text-slate-300 mb-4">{cameraError}</p>
            <button
              type="button"
              onClick={startCamera}
              className="px-5 py-2.5 bg-white text-black font-bold text-xs rounded-xl"
            >
              Coba Lagi
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* CROSSHAIR GUIDES */}
            <div className="absolute inset-8 border border-white/20 rounded-2xl pointer-events-none" />

            {/* LIVE HUD OVERLAY - BRAND LOGO (SUDUT KANAN ATAS) */}
            <div className="absolute top-4 right-4 z-20 pointer-events-none">
              <img
                src={LOGO_ASSET_URL}
                alt="Brand Logo"
                className="w-20 sm:w-28 h-auto object-contain opacity-95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              />
            </div>

            {/* LIVE HUD OVERLAY - TIMESTAMP & STORE ADDRESS (SUDUT KANAN BAWAH) */}
            <div className="absolute bottom-6 right-6 z-20 pointer-events-none text-right max-w-[75%] space-y-1">
              {/* LIVE TIMESTAMP */}
              <div
                className="text-white text-xs sm:text-sm font-semibold tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                style={{
                  textShadow:
                    '0 0 3px #000, 0 0 5px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                }}
              >
                {liveTime}
              </div>

              {/* STORE ADDRESS */}
              <div
                className="text-white text-[11px] sm:text-xs font-medium leading-snug drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] line-clamp-3"
                style={{
                  textShadow:
                    '0 0 3px #000, 0 0 5px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                }}
              >
                {address || 'Gudang Operasional StockFlow'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* BOTTOM CONTROLS */}
      <div className="relative z-30 p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between">
        {/* MINI THUMBNAIL / PREVIEW TRAY */}
        <div className="w-16 flex items-center">
          {lastPhoto ? (
            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/80 shadow-md">
              <img src={lastPhoto} alt="Hasil Terakhir" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl border-2 border-white/20 bg-white/10 flex items-center justify-center">
              <Camera className="w-6 h-6 text-white/40" />
            </div>
          )}
        </div>

        {/* SHUTTER BUTTON */}
        <button
          type="button"
          onClick={handleCapture}
          disabled={currentCount >= maxCount || Boolean(cameraError)}
          className={`w-20 h-20 rounded-full border-4 border-white p-1.5 flex items-center justify-center active:scale-90 transition-all ${
            currentCount >= maxCount ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105'
          }`}
          title="Ambil Foto"
        >
          <div className="w-full h-full bg-white hover:bg-slate-100 rounded-full flex items-center justify-center text-red-600 shadow-xl">
            <Camera className="w-8 h-8" />
          </div>
        </button>

        {/* FINISH BUTTON */}
        <div className="w-20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-lg shadow-red-950/40"
          >
            <Check className="w-4 h-4" />
            <span>{currentCount > 0 ? `Selesai (${currentCount})` : 'Tutup'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
