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
const N8N_PACKING_STATUS_URL = 'https://n8n-v2.humalab.my.id/webhook/warehouse/packing/status';

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

export interface PackingJobStatusResponse {
  success: boolean;
  job_id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NOT_FOUND' | string;
  inv_no?: string;
  store_id?: string;
  total_photos?: number;
  processed_photos?: number;
  drive_folder_url?: string;
  message?: string;
  created_at?: string;
  updated_at?: string;
}

export async function submitPackingDocumentation(
  payload: PackingPayload,
  timeoutMs = 60000
): Promise<{ success: boolean; message: string; job_id?: string; status?: string; drive_folder_url?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(N8N_PACKING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!res.ok) {
      if (res.status === 524 || res.status === 504) {
        throw new Error(
          'Server butuh waktu lebih lama (timeout). Foto tersimpan aman di antrean lokal; silakan klik "Coba Lagi".'
        );
      }
      let msg = `Gagal mengirim dokumentasi ke server (HTTP ${res.status}).`;
      try {
        const err = await res.json();
        msg = err.message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(
        'Permintaan pengunggahan timeout. Foto tetap tersimpan aman di antrean lokal; silakan klik "Coba Lagi".'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkPackingJobStatus(jobId: string): Promise<PackingJobStatusResponse> {
  const cleanJobId = String(jobId || '').trim();
  const res = await fetch(N8N_PACKING_STATUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      job_id: cleanJobId
    })
  });

  if (!res.ok) {
    let msg = 'Gagal memeriksa status antrean packing.';
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
