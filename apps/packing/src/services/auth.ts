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

export const MASTER_STORES: Record<string, { store_name: string; address: string; city: string }> = {
  'STR-300': {
    store_name: 'Gudang Utama Mangga Dua',
    address: 'Jl. Mangga Dua Raya No. 88, Jakarta Pusat',
    city: 'Jakarta Pusat'
  },
  'STR-301': {
    store_name: 'Cabang Tunjungan Plaza',
    address: 'Jl. Embong Malang No. 7-21, Surabaya',
    city: 'Surabaya'
  }
};

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
  if (cached && !cached.startsWith('Gudang Cabang -')) return cached;

  const master = MASTER_STORES[store];
  if (master?.address) return master.address;

  const user = getCurrentSession();
  if (user?.store_address && !user.store_address.startsWith('Gudang Cabang -')) {
    return user.store_address;
  }

  return 'Jl. Mangga Dua Raya No. 88, Jakarta Pusat';
}

export function checkPackingAccess(): boolean {
  return SharedAuth.canAccessApp('packing');
}
