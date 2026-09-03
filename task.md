# Task Guide: Implementasi Cache Pre-Warming Otomatis di n8n (Zero-Cold-Start)

**Dokumen:** Step-by-Step Task & Implementation Guide  
**Fitur:** Otomatisasi Pemanasan Cache Redis (Zero-Cold-Start Warehouse Scanner)  
**Target Pelaksana:** Senior Engineer / n8n Admin / AI Agent  
**Versi Dokumen:** 1.0  
**Tanggal:** 3 September 2026  
**Project:** StockFlow WMS  
**Status:** **READY FOR IMPLEMENTATION**  

---

## 1. Analisis Arsitektur & Skalabilitas (2.000 – 3.000 SKU)

Ketika volume katalog gudang mencapai **2.000 hingga 3.000 artikel/SKU**, sistem tidak boleh melakukan proses secara naif (misalnya query ke Google Sheets per SKU). Berikut adalah analisis teknis lengkap pada setiap lapisan sistem:

```
[Schedule Trigger 06:00 WIB] / [Manual Webhook]
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ Google Sheets API (HANYA 3 API CALLS TOTAL)           │
│  ├─ 1. Read All 'articles' (~3000 rows)   -> ~1.0s     │
│  ├─ 2. Read All 'locations' (~300 rows)   -> ~0.5s     │
│  └─ 3. Read All 'inventory' (~8000 rows)  -> ~1.5s     │
└────────────────────────────────────────────────────────┘
                   │
                   ▼ (V8 Engine Memory: < 10 MB RAM, Runtime: ~35 ms)
┌────────────────────────────────────────────────────────┐
│ n8n Code Node: O(N) Hash-Map Aggregator                │
│  ├─ Build locationMap   : Map<location_code, meta>     │
│  ├─ Build inventoryMap  : Map<sku, Map<loc, qty>>      │
│  └─ Generate 3,000 JSON Payloads format Search Fast    │
└────────────────────────────────────────────────────────┘
                   │
                   ▼ (TTL: 86.400 detik / 24 Jam)
┌────────────────────────────────────────────────────────┐
│ Redis Server (43.163.106.36:6379)                      │
│  ├─ Key   : stockflow:sku:<sku>                        │
│  ├─ Value : JSON stringified search response           │
│  ├─ Memory Footprint: ~1.5 MB RAM (0.15% RAM Server)   │
│  └─ Network Batching / Sequential Time: ~45 - 60s      │
└────────────────────────────────────────────────────────┘
                   │
                   ▼
[Gudang Buka Jam 07:00 WIB: Scan Pertama < 20 ms INSTAN!]
```

---

### Detail Pertimbangan 2.000 – 3.000 SKU:

| Dimensi Sistem | Kondisi pada 2.000 – 3.000 SKU | Solusi & Strategi Terpasang | Status Keamanan |
|---|---|---|:---:|
| **Google Sheets API Rate Limit** | Kuota API Google: 60 request/menit per user. Jika query per SKU, akan langsung terkena HTTP 429 (*Quota Exceeded*). | **Bulk Fetching (Read All Rows):** Seluruh data dibaca hanya dalam **3 API calls** (Sheet `articles`, `inventory`, `locations`). Beban kuota hanya 5% selama 3 detik. | **SANGAT AMAN** |
| **Memori Node.js / n8n (V8 Engine)** | 3.000 artikel + 8.000 baris inventori dimuat sekaligus ke RAM server n8n. | Menggunakan indexing **`Map` O(N)** (bukan `filter`/`find` bersarang O(N²)). Konsumsi memori hanya **~4 s.d. 8 MB RAM** (limit Node.js adalah 1.400 – 4.000 MB). Komputasi selesai dalam **< 50 milidetik**. | **SANGAT AMAN** |
| **Beban RAM Server Redis** | Menyimpan 3.000 kunci `stockflow:sku:*`. | 1 payload SKU rata-rata ~500 bytes. 3.000 SKU × 500 bytes = **~1.5 Megabytes RAM**. Server Redis memiliki RAM 1 GB – 4 GB, sehingga hanya memakan **~0.15% kapasitas RAM**. | **SANGAT AMAN** |
| **Latensi Jaringan Penulisan (Redis I/O)** | Menulis 3.000 key secara sekuensial ke server Redis remote (`43.163.106.36`) dengan latensi RTT ~20 ms. | 3.000 iterasi × 20 ms = **~50 – 60 detik**. Karena cron berjalan di background pukul 06.00 WIB pagi saat gudang belum beroperasi, durasi 1 menit ini sepenuhnya aman dan tidak memblokir apapun. | **SANGAT AMAN** |
| **Strategi TTL (Masa Berlaku Cache)** | Jika TTL disetel 1 jam (3.600s), maka pada pukul 07.00 WIB pas pergantian shift, seluruh cache akan hangus (*expired*). | TTL dinaikkan menjadi **86.400 detik (24 jam)**. Cache tetap hangat sepanjang hari. Setiap pergerakan stok (IN/OUT/MOVE) otomatis di-update secara atomik oleh *Write-Through Movement*. | **OPTIMAL** |

---

## 2. Checklist Pengerjaan (Task Checklist)

### Fase 1: Penyiapan Workflow File & Parameter
- [x] **1.1. Pembuatan File Workflow Template**
  File workflow lengkap telah dibuat di [`n8n/Online Warehouse Cache Pre-Warming.json`](file:///media/muhrobby/DataExternal/Project/warehouse-scanner/n8n/Online%20Warehouse%20Cache%20Pre-Warming.json).
- [ ] **1.2. Verifikasi Kredensial di n8n**
  Pastikan akun n8n (`https://n8n-v2.humalab.my.id`) memiliki:
  - `Google Kantor` (OAuth2 Google Sheets API: `Run12tue3CjJLstj`)
  - `Redis Warehouse` (Redis Standalone: `redis_warehouse`)
- [ ] **1.3. Verifikasi Sheet ID & Spreadsheet URL**
  - Spreadsheet URL: `https://docs.google.com/spreadsheets/d/1pGk2tQo5qshqJTrtZi6iYZ8zwLKK7kwYqDxCHHGxaDM`
  - Sheet `articles` GID: `255548982`
  - Sheet `locations` GID: `674471789`
  - Sheet `inventory` GID: `91128518`

---

### Fase 2: Pemasangan Node & Logika Pre-Warming di n8n

- [ ] **2.1. Trigger Ganda (Schedule Cron + Webhook Manual)**
  - **Schedule Trigger (`Schedule - 06:00 WIB Daily`):**
    - Cron Expression: `0 6 * * *` (atau `0 23 * * *` UTC).
    - Timezone: `Asia/Jakarta`.
  - **Webhook Trigger (`Webhook - Manual Prewarm`):**
    - Method: `POST`
    - Path: `warehouse/cache/prewarm`
    - Response Mode: `Using 'Respond to Webhook' Node`
    - Tujuan: Memungkinkan admin/supervisor memicu pemanasan manual sewaktu-waktu (misal setelah impor bulk).

- [ ] **2.2. Pembacaan Master Data Google Sheets (Bulk Fetch)**
  - Node 1: `Google Sheets - Read Articles` (Membaca seluruh kolom `sku`, `description`).
  - Node 2: `Google Sheets - Read Locations` (Membaca seluruh data rak `location_code`, `zone`, `section`, `position`).
  - Node 3: `Google Sheets - Read Inventory` (Membaca seluruh stok `sku`, `location_code`, `qty`).
  - *Catatan Kritis:* Jangan gunakan filter kolom agar Google Sheets API hanya terpanggil 3 kali! Pasang `executeOnce: true`.

- [ ] **2.3. Agregasi Data di JavaScript (Code Node)**
  Gunakan node Code (`Compile SKU Cache Entries`) dengan logika performa tinggi:
  ```javascript
  const articles = $('Google Sheets - Read Articles').all().map(item => item.json);
  const inventoryRows = $('Google Sheets - Read Inventory').all().map(item => item.json);
  const locationRows = $('Google Sheets - Read Locations').all().map(item => item.json);

  // 1. Build Location Map
  const locationMap = new Map();
  for (const loc of locationRows) {
    const code = String(loc.location_code || '').trim();
    if (!code) continue;
    locationMap.set(code, {
      zone: String(loc.zone || ''),
      section: String(loc.section || ''),
      position: String(loc.position || '')
    });
  }

  // 2. Build Inventory Map
  const skuInventoryMap = new Map();
  for (const inv of inventoryRows) {
    const sku = String(inv.sku || '').trim();
    const locCode = String(inv.location_code || '').trim();
    if (!sku || !locCode) continue;

    let qty = Number(inv.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    if (!skuInventoryMap.has(sku)) {
      skuInventoryMap.set(sku, new Map());
    }
    const locStock = skuInventoryMap.get(sku);
    locStock.set(locCode, (locStock.get(locCode) || 0) + qty);
  }

  // 3. Compile output items for Redis
  const output = [];
  for (const art of articles) {
    const sku = String(art.sku || '').trim();
    if (!sku) continue;

    const description = String(art.description || '');
    const locStock = skuInventoryMap.get(sku);
    const locations = [];

    if (locStock) {
      for (const [locCode, qty] of locStock.entries()) {
        const locMeta = locationMap.get(locCode) || { zone: '', section: '', position: '' };
        locations.push({
          location_code: locCode,
          zone: locMeta.zone,
          section: locMeta.section,
          position: locMeta.position,
          qty: qty
        });
      }
    }

    locations.sort((a, b) =>
      a.location_code.localeCompare(b.location_code, undefined, { numeric: true })
    );

    const totalStock = locations.reduce((sum, l) => sum + l.qty, 0);

    const responsePayload = {
      success: true,
      message: 'Barang ditemukan.',
      item: {
        sku,
        description,
        total_stock: totalStock,
        locations
      }
    };

    output.push({
      json: {
        sku,
        key: 'stockflow:sku:' + sku,
        value: JSON.stringify(responsePayload),
        total_stock: totalStock,
        location_count: locations.length
      }
    });
  }

  return output;
  ```

- [ ] **2.4. Penulisan ke Redis (Prewarm Set)**
  - Node: `Redis - Prewarm SKU Cache`
  - Operation: `set`
  - Key: `={{ $json.key }}`
  - Value: `={{ $json.value }}`
  - TTL: `86400` (24 jam)
  - `continueOnFail: true` (Jika ada 1 SKU gagal format, proses tidak boleh terhenti).

- [ ] **2.5. Ringkasan & Output Response**
  - Node: `Summarize Result` (Menghitung jumlah total SKU yang berhasil dihangatkan).
  - Node: `Respond to Webhook` (Mengembalikan respon JSON ke pemanggil manual webhook).

---

### Fase 3: Harmonisasi TTL pada Workflow Eksisting

Untuk menjaga konsistensi arsitektur, samakan TTL pada workflow pencarian dan mutasi stok:
- [ ] **3.1. Penyesuaian TTL di `Online Warehouse Search (Redis Fast)`**
  - Pada node `Redis - Set SKU Cache`, ubah parameter `ttl` dari `3600` menjadi `86400`.
- [ ] **3.2. Penyesuaian TTL di `Online Warehouse Movement (Redis Fast)`**
  - Pada node `Redis - Set Cache (IN)`, `Redis - Set Cache (OUT)`, dan `Redis - Set Cache (MOVE)`, ubah parameter `ttl` dari `3600` menjadi `86400`.

---

## 3. Matriks Pengujian & Verifikasi (Test Matrix)

| ID | Skenario Uji | Tindakan / Perintah | Hasil yang Diharapkan | Status |
|:---:|---|---|---|:---:|
| **TC-01** | Manual Pre-Warm Trigger | Kirim `POST https://n8n-v2.humalab.my.id/webhook/warehouse/cache/prewarm` | HTTP 200 dengan JSON summary `{"success": true, "total_skus_warmed": X}` | `[ ]` |
| **TC-02** | Verifikasi Kunci di Redis | Periksa keberadaan kunci di Redis via CLI/Node | Kunci `stockflow:sku:*` terisi sesuai jumlah baris `articles` | `[ ]` |
| **TC-03** | Verifikasi TTL 24 Jam | Periksa TTL salah satu kunci `TTL stockflow:sku:<sku>` | Mengembalikan nilai antara `86000` s.d. `86400` detik | `[ ]` |
| **TC-04** | Latensi Scan Pertama (Zero-Cold-Start) | Scan SKU sembarang yang belum pernah dibuka hari itu | Waktu respon **< 20 ms**, node `Evaluate Cache` menghasilkan `cache_hit: true` | `[ ]` |
| **TC-05** | Barang dengan Stok 0 | Scan SKU yang ada di `articles` tapi tidak ada di `inventory` | Mengembalikan JSON dengan `total_stock: 0`, `locations: []`, instan (< 20 ms) | `[ ]` |
| **TC-06** | Konsistensi Write-Through | Lakukan movement (OUT/MOVE) pada SKU yang sudah di-prewarm | Cache terupdate secara atomik dengan nilai stok baru, TTL ter-refresh | `[ ]` |
| **TC-07** | Verifikasi Cron 06.00 WIB | Pantau riwayat eksekusi n8n setelah jam 06.00 WIB | Status eksekusi `Success` tercatat otomatis setiap hari | `[ ]` |

---

## 4. Prosedur Uji Cepat (Quick Test Commands)

### 1. Memicu Manual Pre-Warming (cURL):
```bash
curl -X POST https://n8n-v2.humalab.my.id/webhook/warehouse/cache/prewarm \
  -H "Content-Type: application/json"
```

### 2. Menguji Kecepatan Respon Pencarian (cURL Benchmark):
```bash
curl -w "\nTime taken: %{time_total}s\n" -X POST https://n8n-v2.humalab.my.id/webhook/warehouse/search \
  -H "Content-Type: application/json" \
  -d '{"sku": "SKU-PROD-001"}'
```
*Target: `time_total` harus berada di bawah `0.05s` (50 ms).*

---

## 5. Mitigasi Risiko & Penanganan Masalah (Troubleshooting)

1. **Bagaimana jika admin menambah SKU baru di Google Sheets pada siang hari?**
   - Workflow `Online Warehouse Search (Redis Fast)` memiliki sistem *Cache-Aside* fallback. Jika SKU belum ada di Redis, sistem akan otomatis membaca Google Sheets dan menyimpan hasilnya ke Redis.
   - Admin juga dapat memicu webhook `POST /warehouse/cache/prewarm` kapan saja untuk sinkronisasi menyeluruh.

2. **Bagaimana jika eksekusi n8n melebihi timeout default?**
   - Pada setting workflow n8n, matikan `Save execution progress` dan `Save successful execution data` (sudah disetel default pada file JSON) agar database n8n tidak menampung beban log 3.000 item.
