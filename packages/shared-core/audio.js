/**
 * AudioFeedback — Synthesizer Feedback Audio untuk Seluruh Aplikasi Gudang (Monorepo)
 * Menggunakan Web Audio API sintetis (0 KB asset, tanpa file MP3/WAV eksternal)
 * Meniru scanner fisik Honeywell/Zebra dan Shutter Kamera Dokumentasi
 */

const STORAGE_KEY = 'stockflow_audio_enabled';

let audioCtx = null;
let isEnabled = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) !== 'false' : true;

export function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

export async function ensureAudioContextRunning() {
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

export function initAutoplayUnlocker() {
  if (typeof window === 'undefined') return;
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
 * BEEP TINGGI (1800 Hz Sine Wave, 105ms)
 * Dipakai saat: Scan sukses, mutasi sukses, login sukses
 */
export async function playSuccess() {
  if (!isEnabled) return;
  try {
    const ctx = await ensureAudioContextRunning();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);

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
 * DOUBLE BUZZ RENDAH (160 Hz Sawtooth Wave, 2 pulsa)
 * Dipakai saat: Scan gagal, barang ditolak server, form error
 */
export async function playError() {
  if (!isEnabled) return;
  try {
    const ctx = await ensureAudioContextRunning();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);

    // Pulsa 1
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.55, now + 0.008);
    gain.gain.setValueAtTime(0.55, now + 0.075);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.085);

    // Jeda hening
    gain.gain.setValueAtTime(0.001, now + 0.125);

    // Pulsa 2
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
 * SUARA SHUTTER KAMERA SINTETIS (Klik Shutter 0 KB)
 * Dipakai saat: Operator packing menekan tombol jepret foto beruntun
 */
export async function playShutter() {
  if (!isEnabled) return;
  try {
    const ctx = await ensureAudioContextRunning();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Dual frequency click simulating mechanical shutter
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(2400, now);
    osc1.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(800, now + 0.045);
    osc2.frequency.exponentialRampToValueAtTime(200, now + 0.09);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.045);
    osc2.start(now + 0.045);
    osc2.stop(now + 0.1);
  } catch (err) {
    console.warn('[AudioFeedback] Gagal memutar nada shutter:', err);
  }
}

export function isAudioEnabled() {
  return isEnabled;
}

export async function setAudioEnabled(enabled) {
  isEnabled = Boolean(enabled);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, isEnabled ? 'true' : 'false');
  }
  if (isEnabled) {
    await playSuccess();
  }
  return isEnabled;
}

export async function toggleAudio() {
  return await setAudioEnabled(!isEnabled);
}

// Inisialisasi otomatis jika di lingkungan browser
if (typeof window !== 'undefined') {
  initAutoplayUnlocker();
}

export const AudioFeedback = {
  playSuccess,
  playBeep: playSuccess,
  playError,
  playBuzz: playError,
  playShutter,
  isAudioEnabled,
  setAudioEnabled,
  toggleAudio,
  unlock: ensureAudioContextRunning
};

if (typeof window !== 'undefined') {
  window.AudioFeedback = AudioFeedback;
}

export default AudioFeedback;
