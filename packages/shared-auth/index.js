/**
 * @wms/shared-auth — Single Source of Authentication & Session Management
 * Digunakan oleh semua aplikasi di Monorepo (Portal, StockFlow, Packing, dll.)
 */

export const SESSION_KEY = 'warehouse_session';
export const ACTIVE_STORE_KEY = 'active_store';
export const DEFAULT_LOGIN_URL = 'https://n8n-v2.humalab.my.id/webhook/warehouse/login';
export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 jam

export function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    access_id: String(user.access_id || user.nik || '').trim(),
    nik: String(user.access_id || user.nik || '').trim(),
    nama: String(user.nama || user.name || '').trim(),
    role: String(user.role || 'USER').trim().toUpperCase(),
    default_store_id: String(user.default_store_id || '').trim().toUpperCase(),
    allowed_stores: String(user.allowed_stores || '').trim().toUpperCase(),
    enabled_apps: String(user.enabled_apps || 'stockflow,packing').trim().toLowerCase(),
    store_name: String(user.store_name || '').trim(),
    store_address: String(user.store_address || user.address || '').trim()
  };
}

export async function login(accessId, apiUrl = DEFAULT_LOGIN_URL) {
  const cleanId = String(accessId || '').trim();
  if (!cleanId) {
    throw new Error('Akses ID tidak boleh kosong');
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      access_id: cleanId,
      nik: cleanId
    })
  });

  if (!res.ok) {
    let errMsg = 'Gagal terhubung ke server autentikasi.';
    try {
      const errJson = await res.json();
      errMsg = errJson.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  if (!data || !data.success) {
    throw new Error(data.message || 'Login gagal. Akses ID tidak terdaftar atau non-aktif.');
  }

  const normalizedUser = normalizeUser(data.user);
  saveSession(normalizedUser);

  // Set default active store if not set
  if (normalizedUser && normalizedUser.default_store_id) {
    setActiveStore(normalizedUser.default_store_id);
  }

  return {
    success: true,
    user: normalizedUser
  };
}

export function saveSession(user, ttlMs = DEFAULT_SESSION_TTL_MS) {
  const session = {
    user: normalizeUser(user),
    created_at: Date.now(),
    expires_at: Date.now() + ttlMs
  };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('[SharedAuth] Gagal menyimpan sesi ke localStorage:', e);
  }

  return session;
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (!session || !session.user || !session.expires_at) {
      clearSession();
      return null;
    }

    if (Date.now() > Number(session.expires_at)) {
      clearSession();
      return null;
    }

    session.user = normalizeUser(session.user);
    return session;
  } catch (_) {
    clearSession();
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}

export function canAccessApp(appName) {
  const session = getSession();
  if (!session || !session.user) return false;
  const user = session.user;
  if (user.role === 'SUPER_ADMIN') return true;

  const allowedApps = (user.enabled_apps || '')
    .split(',')
    .map(s => s.trim().toLowerCase());

  return allowedApps.includes(appName.toLowerCase()) || allowedApps.includes('*');
}

export function getActiveStore() {
  try {
    const saved = localStorage.getItem(ACTIVE_STORE_KEY);
    if (saved) return saved.trim().toUpperCase();
  } catch (_) {}

  const session = getSession();
  if (session && session.user && session.user.default_store_id) {
    return session.user.default_store_id;
  }
  return '';
}

export function setActiveStore(storeId) {
  const clean = String(storeId || '').trim().toUpperCase();
  try {
    localStorage.setItem(ACTIVE_STORE_KEY, clean);
  } catch (_) {}
  return clean;
}

export const SharedAuth = {
  SESSION_KEY,
  ACTIVE_STORE_KEY,
  DEFAULT_LOGIN_URL,
  DEFAULT_SESSION_TTL_MS,
  normalizeUser,
  login,
  saveSession,
  getSession,
  clearSession,
  canAccessApp,
  getActiveStore,
  setActiveStore
};

// Global fallback for browser vanilla JS
if (typeof window !== 'undefined') {
  window.SharedAuth = SharedAuth;
}

export default SharedAuth;
