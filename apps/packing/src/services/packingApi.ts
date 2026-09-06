export interface PackingPhoto {
  id: string;
  dataUrl: string;
  timestamp: string;
}

export interface PackingPayload {
  id: string;
  store_id: string;
  store_code: string;
  inv_no: string;
  timestamp: string;
  time_created: string;
  address: string;
  access_id: string;
  user_name: string;
  total_photos: number;
  photos: {
    filename: string;
    data: string;
    timestamp: string;
  }[];
}

export interface PackingHistoryItem {
  store_id: string;
  inv_no: string;
  address: string;
  total_photos: number;
  link_google_drive: string;
  access_id: string;
  timestamp: string;
}

const N8N_PACKING_URL = 'https://n8n-v2.humalab.my.id/webhook/warehouse/packing';
const N8N_PACKING_SEARCH_URL = 'https://n8n-v2.humalab.my.id/webhook/warehouse/packing/search';
const N8N_PACKING_STORE_INFO_URL = 'https://n8n-v2.humalab.my.id/webhook/warehouse/packing/store-info';

export interface StoreInfoResponse {
  success: boolean;
  store_id: string;
  store_code?: string;
  store_name?: string;
  address: string;
  city?: string;
}

export async function fetchStoreInfo(storeId: string): Promise<StoreInfoResponse> {
  const cleanStoreId = String(storeId || '').trim().toUpperCase();
  const res = await fetch(N8N_PACKING_STORE_INFO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      store_id: cleanStoreId
    })
  });

  if (!res.ok) {
    let msg = 'Gagal mengambil data toko dari server';
    try {
      const err = await res.json();
      msg = err.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  return data;
}

export async function submitPackingDocumentation(
  payload: PackingPayload
): Promise<{ success: boolean; message: string; drive_folder_url?: string }> {
  const res = await fetch(N8N_PACKING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let msg = 'Gagal mengirim dokumentasi ke server. Silakan periksa koneksi.';
    try {
      const err = await res.json();
      msg = err.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  return data;
}

export async function searchPackingDocumentation(
  storeId: string,
  query?: string
): Promise<{ success: boolean; store_id: string; total: number; items: PackingHistoryItem[] }> {
  const cleanStoreId = String(storeId || '').trim().toUpperCase();
  const cleanQuery = String(query || '').trim().toUpperCase();

  const res = await fetch(N8N_PACKING_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      store_id: cleanStoreId,
      query: cleanQuery
    })
  });

  if (!res.ok) {
    let msg = 'Gagal mencari riwayat dokumentasi di server.';
    try {
      const err = await res.json();
      msg = err.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  return data;
}
