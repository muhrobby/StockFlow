// @ts-ignore
import { SharedAuth } from '@shared-auth';

export interface UserSession {
  access_id: string;
  nama: string;
  role: string;
  default_store_id: string;
  allowed_stores: string;
  enabled_apps: string;
  store_address?: string;
}

export function getCurrentSession(): UserSession | null {
  const session = SharedAuth.getSession();
  if (!session || !session.user) return null;
  return session.user;
}

export function getStoreCode(): string {
  const store = SharedAuth.getActiveStore();
  if (store) return store;
  const user = getCurrentSession();
  return user?.default_store_id || 'STR-001';
}

const STORE_ADDRESS_CACHE_PREFIX = 'packing_store_address_';

export function getCachedStoreAddress(storeId: string): string | null {
  try {
    return localStorage.getItem(`${STORE_ADDRESS_CACHE_PREFIX}${storeId}`);
  } catch (_) {
    return null;
  }
}

export function setCachedStoreAddress(storeId: string, address: string): void {
  try {
    localStorage.setItem(`${STORE_ADDRESS_CACHE_PREFIX}${storeId}`, address);
  } catch (_) {}
}

export function getStoreAddress(): string {
  const store = getStoreCode();
  const cached = getCachedStoreAddress(store);
  if (cached) return cached;
  const user = getCurrentSession();
  if (user?.store_address) return user.store_address;
  return `Gudang Cabang - ${store}`;
}

export function checkPackingAccess(): boolean {
  return SharedAuth.canAccessApp('packing');
}
