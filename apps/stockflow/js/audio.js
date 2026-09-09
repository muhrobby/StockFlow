/**
 * AudioFeedback — Synthesizer Feedback Audio untuk StockFlow WMS
 * Menghasilkan feedback suara instan meniru scanner fisik Honeywell/Zebra
 * Menggunakan Web Audio API sintetis (0 KB asset, tanpa file MP3/WAV eksternal)
 */
const AudioFeedback = (function () {
  'use strict';

  const STORAGE_KEY = 'stockflow_audio_enabled';

  // Shared AudioContext (Singleton)
  let audioCtx = null;

  // Baca preferensi tersimpan, default: true (aktif)
  let isEnabled = localStorage.getItem(STORAGE_KEY) !== 'false';

  /**
   * Mengambil atau membuat AudioContext singleton.
   */
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    return audioCtx;
  }

  /**
   * Memastikan AudioContext dalam status 'running'.
   * Mengatasi browser autoplay policy (Android Chrome & iOS Safari).
   */
  async function ensureAudioContextRunning() {
    const ctx = getAudioContext();
    if (!ctx) return null;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('[AudioFeedback] Gagal me-resume AudioContext:', err);
      }
    }
    return ctx;
  }

  /**
   * Listener pembuka kunci (unlocker) untuk mobile browser
   * Berjalan pada sentuhan / klik pertama pengguna di seluruh dokumen.
   */
  function initAutoplayUnlocker() {
    const unlockEvents = ['touchstart', 'touchend', 'click', 'keydown'];

    function handleFirstGesture() {
      ensureAudioContextRunning().then((ctx) => {
        if (ctx && ctx.state === 'running') {
          unlockEvents.forEach((evt) => {
            document.removeEventListener(evt, handleFirstGesture, true);
          });
        }
      });
    }

    unlockEvents.forEach((evt) => {
      document.addEventListener(evt, handleFirstGesture, { capture: true, passive: true });
    });
  }

  /**
   * Membunyikan BEEP TINGGI (Crisp Scanner Tone)
   * Karakter: 1800 Hz Sine Wave, volume stabil 0.65 (loud & punchy), durasi 105ms
   * Dipakai saat: Scan barcode sukses, Movement sukses.
   */
  async function playSuccess() {
    if (!isEnabled) return;

    try {
      const ctx = await ensureAudioContextRunning();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, now);

      // Envelope stabil agar terdengar jelas & lantang:
      // 0 - 8ms   : Ramp up ke volume 0.65 (mencegah bunyi pop/klik)
      // 8 - 80ms  : Sustain volume 0.65 (bunyi solid menembus bising)
      // 80 - 105ms: Ramp down ke 0.001 (pelepasan halus)
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.65, now + 0.008);
      gain.gain.setValueAtTime(0.65, now + 0.080);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.105);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      };

      osc.start(now);
      osc.stop(now + 0.110);
    } catch (err) {
      console.warn('[AudioFeedback] Gagal memutar nada sukses:', err);
    }
  }

  /**
   * Membunyikan DOUBLE BUZZ RENDAH (Harsh Double Buzzer)
   * Karakter: 160 Hz Sawtooth Wave, 2 pulsa x 80ms dengan jeda 40ms
   * Dipakai saat: Scan gagal, barang tidak ditemukan, stok ditolak server.
   */
  async function playError() {
    if (!isEnabled) return;

    try {
      const ctx = await ensureAudioContextRunning();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth'; // Gelombang gergaji menghasilkan dengung kasar
      osc.frequency.setValueAtTime(160, now);

      // Pola Double Buzz menggunakan linearRampToValueAtTime (aman di semua browser):
      // Pulsa 1: 0ms -> 80ms (Vol 0.55)
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.55, now + 0.008);
      gain.gain.setValueAtTime(0.55, now + 0.075);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.085);

      // Jeda hening: 85ms -> 125ms
      gain.gain.setValueAtTime(0.001, now + 0.125);

      // Pulsa 2: 125ms -> 205ms (Vol 0.55)
      gain.gain.linearRampToValueAtTime(0.55, now + 0.133);
      gain.gain.setValueAtTime(0.55, now + 0.195);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.205);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      };

      osc.start(now);
      osc.stop(now + 0.210);
    } catch (err) {
      console.warn('[AudioFeedback] Gagal memutar nada error:', err);
    }
  }

  /**
   * Mengambil status audio saat ini
   */
  function isAudioEnabled() {
    return isEnabled;
  }

  /**
   * Mengubah status aktif/hening audio (Toggle)
   */
  async function toggleAudio() {
    return await setAudioEnabled(!isEnabled);
  }

  /**
   * Mengatur status aktif/hening secara eksplisit
   */
  async function setAudioEnabled(enabled) {
    isEnabled = Boolean(enabled);
    localStorage.setItem(STORAGE_KEY, isEnabled ? 'true' : 'false');
    updateToggleUI();

    // Bunyikan nada uji coba jika diaktifkan
    if (isEnabled) {
      await playSuccess();
    }
    return isEnabled;
  }

  /**
   * Sinkronkan tampilan visual tombol di Header UI
   */
  function updateToggleUI() {
    const btn = document.getElementById('btnToggleAudio');
    const icon = document.getElementById('audioIcon');
    if (!btn || !icon) return;

    if (isEnabled) {
      btn.classList.remove('text-slate-400', 'bg-slate-50');
      btn.classList.add('text-slate-600', 'bg-slate-100');
      btn.setAttribute('title', 'Suara Beep: Aktif (Klik untuk bisukan)');
      btn.setAttribute('aria-label', 'Suara Beep Aktif');
      icon.setAttribute('data-lucide', 'volume-2');
    } else {
      btn.classList.remove('text-slate-600', 'bg-slate-100');
      btn.classList.add('text-slate-400', 'bg-slate-100');
      btn.setAttribute('title', 'Suara Beep: Hening (Klik untuk bunyikan)');
      btn.setAttribute('aria-label', 'Suara Beep Hening');
      icon.setAttribute('data-lucide', 'volume-x');
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // Pasang listener pembuka kunci secara otomatis saat script dimuat
  initAutoplayUnlocker();

  return {
    playSuccess,
    playBeep: playSuccess,
    playError,
    playBuzz: playError,
    isAudioEnabled,
    toggleAudio,
    setAudioEnabled,
    updateToggleUI,
    unlock: ensureAudioContextRunning
  };
})();

// Lampirkan ke global window
window.AudioFeedback = AudioFeedback;
