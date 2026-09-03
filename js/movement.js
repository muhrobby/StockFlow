/* =========================================
   MOVEMENT MODULE
========================================= */

const MovementState = {
  loading: false
};


document.addEventListener('DOMContentLoaded', () => {

  bindMovementEvents();
  syncMovementForm();

});


function bindMovementEvents() {

  const form = document.getElementById('movementForm');
  const type = document.getElementById('movementType');
  const scanButton = document.getElementById('movementScanButton');
  const fromScanButton = document.getElementById('movementFromScanButton');
  const toScanButton = document.getElementById('movementToScanButton');

  if (form) {
    form.addEventListener('submit', handleMovementSubmit);
  }

  if (type) {
    type.addEventListener('change', syncMovementForm);
  }

  if (scanButton) {
    scanButton.addEventListener('click', handleMovementScan);
  }

  if (fromScanButton) {
    fromScanButton.addEventListener('click', () => handleLocationScan('movementFromLocation', 'Lokasi asal'));
  }

  if (toScanButton) {
    toScanButton.addEventListener('click', () => handleLocationScan('movementToLocation', 'Lokasi tujuan'));
  }

  /*
   * App.js sudah memiliki navigateTo().
   * Kita bungkus fungsi tersebut agar setiap kali
   * halaman movement dibuka, NIK user ikut disinkronkan.
   */
  const originalNavigateTo = window.navigateTo;

  if (typeof originalNavigateTo === 'function') {
    window.navigateTo = function (page) {
      originalNavigateTo(page);

      if (page === 'movement') {
        syncMovementForm();
      }
    };
  }

}


function syncMovementForm() {

  const type = document.getElementById('movementType');
  const fromWrapper = document.getElementById('movementFromWrapper');
  const toWrapper = document.getElementById('movementToWrapper');
  const nikInput = document.getElementById('movementNik');

  if (!type) {
    return;
  }

  const movementType = type.value;

  /* IN hanya membutuhkan destination */
  if (movementType === 'IN') {
    fromWrapper?.classList.add('hidden');
    toWrapper?.classList.remove('hidden');
  }

  /* OUT hanya membutuhkan source */
  if (movementType === 'OUT') {
    fromWrapper?.classList.remove('hidden');
    toWrapper?.classList.add('hidden');
  }

  /* MOVE membutuhkan source + destination */
  if (movementType === 'MOVE') {
    fromWrapper?.classList.remove('hidden');
    toWrapper?.classList.remove('hidden');
  }

  if (nikInput && AppState.user) {
    nikInput.value = AppState.user.nik || '';
  }

}


async function handleMovementScan() {

  if (MovementState.loading) {
    return;
  }

  hideMovementError();

  try {

    await Scanner.open(async decodedText => {

      const sku = normalizeValue(decodedText);

      if (!sku) {
        showMovementError('Barcode tidak menghasilkan SKU yang valid.');
        return;
      }

      const input = document.getElementById('movementSku');

      if (input) {
        input.value = sku;
      }

      showToast(`SKU terbaca: ${sku}`);

    });

  } catch (error) {

    console.error('Movement scanner error:', error);

    showMovementError(
      error.message || 'Kamera tidak dapat dibuka.'
    );

  }

}


async function handleLocationScan(inputId, label) {

  if (MovementState.loading) {
    return;
  }

  hideMovementError();

  try {

    await Scanner.open(async decodedText => {

      const location = normalizeValue(decodedText);

      if (!location) {
        showMovementError('Barcode tidak menghasilkan lokasi yang valid.');
        return;
      }

      const input = document.getElementById(inputId);

      if (input) {
        input.value = location.toUpperCase();
      }

      showToast(`${label} terbaca: ${location}`);

    });

  } catch (error) {

    console.error('Location scanner error:', error);

    showMovementError(
      error.message || 'Kamera tidak dapat dibuka.'
    );

  }

}


async function handleMovementSubmit(event) {

  event.preventDefault();

  hideMovementError();
  hideMovementSuccess();

  const type = normalizeValue(
    document.getElementById('movementType')?.value
  ).toUpperCase();

  const sku = normalizeValue(
    document.getElementById('movementSku')?.value
  );

  const qty = Number(
    document.getElementById('movementQty')?.value
  );

  const fromLocation = normalizeValue(
    document.getElementById('movementFromLocation')?.value
  ).toUpperCase();

  const toLocation = normalizeValue(
    document.getElementById('movementToLocation')?.value
  ).toUpperCase();

  const nik = normalizeValue(
    AppState.user?.nik ||
    document.getElementById('movementNik')?.value
  );

  const errors = [];

  if (!['IN', 'OUT', 'MOVE'].includes(type)) {
    errors.push('Jenis movement tidak valid.');
  }

  if (!sku) {
    errors.push('SKU wajib diisi.');
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    errors.push('Qty harus lebih besar dari 0.');
  }

  if (!nik) {
    errors.push('NIK user tidak ditemukan. Silakan login ulang.');
  }

  if (type === 'IN' && !toLocation) {
    errors.push('Lokasi tujuan wajib diisi.');
  }

  if (type === 'OUT' && !fromLocation) {
    errors.push('Lokasi asal wajib diisi.');
  }

  if (type === 'MOVE') {
    if (!fromLocation) {
      errors.push('Lokasi asal wajib diisi.');
    }

    if (!toLocation) {
      errors.push('Lokasi tujuan wajib diisi.');
    }

    if (fromLocation && toLocation && fromLocation === toLocation) {
      errors.push('Lokasi asal dan tujuan tidak boleh sama.');
    }
  }

  if (errors.length) {
    showMovementError(errors.join(' '));
    return;
  }

  const payload = {
    type,
    sku,
    qty,
    from_location: fromLocation,
    to_location: toLocation,
    nik
  };

  // 1. Generate local movement ID for optimistic tracking
  const now = new Date();
  const compactTs = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(now).replace(/[-:\s]/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const localMovementId = `MOV-${compactTs}-${rand}`;

  // 2. OPTIMISTIC FEEDBACK (0 ms)
  if (navigator.vibrate) {
    navigator.vibrate([60, 40, 60]);
  }

  // Mainkan Beep Sukses instan
  if (window.AudioFeedback) {
    window.AudioFeedback.playSuccess();
  }

  const typeLabels = {
    IN: 'Barang masuk',
    OUT: 'Barang keluar',
    MOVE: 'Pindah barang'
  };
  const label = typeLabels[type] || 'Movement';
  showToast(`${label} dicatat! Menyinkronkan...`);

  // Render kartu sukses optimistik seketika
  renderMovementSuccess({
    type,
    sku,
    movement_qty: qty,
    from_location: fromLocation,
    to_location: toLocation,
    movement_id: localMovementId,
    status: 'syncing'
  });

  // Reset form seketika agar operator langsung bisa scan barang berikutnya
  resetMovementForm();
  flashSubmitSuccess();

  // Sinkronkan cache lokal pencarian (SearchCache) secara optimistik
  syncSearchCacheOnMovement(payload);

  // 3. OFFLINE QUEUE CHECK
  if (!navigator.onLine) {
    if (typeof QueueManager !== 'undefined') {
      QueueManager.enqueue(payload);
    }
    updateMovementSuccessStatus('offline', localMovementId);
    showToast("Offline: Movement tersimpan di HP & akan otomatis dikirim saat online");
    return;
  }

  // 4. NON-BLOCKING BACKGROUND DISPATCH
  sendMovementBackground(payload, localMovementId);

}


function sendMovementBackground(payload, localMovementId) {

  if (typeof SyncTracker !== 'undefined') {
    SyncTracker.addInFlight(localMovementId, payload);
  }

  Api.post('/warehouse/movement', payload)
    .then(result => {

      if (!result || result.success !== true) {
        throw new Error(result?.message || 'Transaksi movement ditolak server.');
      }

      // Berhasil tersinkron ke Google Sheets & Redis!
      const serverId = result.data?.movement_id || localMovementId;
      updateMovementSuccessStatus('synced', serverId);

      if (typeof SyncTracker !== 'undefined') {
        SyncTracker.markCompleted(localMovementId, payload, result.data);
      }

      // Silent revalidation jika SKU ini sedang aktif dibuka di halaman cari
      if (
        typeof executeSearch === 'function' &&
        typeof AppState !== 'undefined' &&
        AppState.lastSearch?.sku === payload.sku
      ) {
        executeSearch(payload.sku, { backgroundSync: true, silent: true });
      }

    })
    .catch(error => {

      if (typeof SyncTracker !== 'undefined') {
        SyncTracker.markFailed(localMovementId);
      }

      console.error('Movement background error:', error);

      const isNetworkErr =
        !navigator.onLine ||
        error.name === 'AbortError' ||
        String(error.message || '').toLowerCase().includes('terlalu lama') ||
        String(error.message || '').toLowerCase().includes('network') ||
        String(error.message || '').toLowerCase().includes('failed to fetch');

      if (isNetworkErr) {
        // Jaringan putus / timeout: amankan ke offline QueueManager
        if (typeof QueueManager !== 'undefined') {
          QueueManager.enqueue(payload);
        }

        updateMovementSuccessStatus('offline', localMovementId);

        if (navigator.vibrate) {
          navigator.vibrate([150, 75, 150]);
        }

        if (window.AudioFeedback) {
          window.AudioFeedback.playError();
        }

        if (typeof openErrorModal === 'function') {
          openErrorModal({
            title: 'Koneksi Terputus (Offline)',
            message: 'Sinyal internet tidak stabil saat menyimpan pergerakan. Transaksi telah otomatis disimpan di memori HP Anda dan akan dikirim ulang begitu online.',
            payload,
            canRetry: true,
            retryLabel: 'Kirim Ulang',
            onRetry: () => {
              showToast('Mencoba kirim ulang...');
              updateMovementSuccessStatus('syncing', localMovementId);
              sendMovementBackground(payload, localMovementId);
            }
          });
        }
      } else {
        // Error bisnis dari server (misal: stok kurang / SKU tidak ditemukan)
        // Rollback status & bersihkan cache SKU yang salah
        rollbackSearchCache(payload.sku);
        hideMovementSuccess();

        if (navigator.vibrate) {
          navigator.vibrate([250, 100, 250, 100, 250]);
        }

        showMovementError(error.message || 'Transaksi ditolak oleh server.');

        if (typeof openErrorModal === 'function') {
          openErrorModal({
            title: 'Transaksi Ditolak Server',
            message: error.message || 'Server menolak transaksi movement. Silakan periksa kembali data stok atau lokasi.',
            payload,
            canRetry: false
          });
        }
      }

    });

}


function syncSearchCacheOnMovement(payload) {

  const { type, sku, qty, from_location, to_location } = payload;
  if (!sku) return;

  if (typeof SearchCache !== 'undefined' && SearchCache.has(sku)) {
    const cached = SearchCache.get(sku);
    if (cached && cached.item && Array.isArray(cached.item.locations)) {
      const item = JSON.parse(JSON.stringify(cached.item));

      if (type === 'OUT' || type === 'MOVE') {
        for (const loc of item.locations) {
          if (loc.location_code === from_location) {
            loc.qty = Math.max(0, Number(loc.qty || 0) - qty);
          }
        }
      }

      if (type === 'IN' || type === 'MOVE') {
        let destFound = false;
        for (const loc of item.locations) {
          if (loc.location_code === to_location) {
            loc.qty = Number(loc.qty || 0) + qty;
            destFound = true;
          }
        }
        if (!destFound && to_location) {
          item.locations.push({
            location_code: to_location,
            zone: to_location.split('-')[0] || '',
            section: to_location.split('-')[1] || '',
            position: to_location.split('-')[2] || '',
            qty: qty
          });
        }
      }

      item.locations = item.locations.filter(l => Number(l.qty || 0) > 0);
      item.locations.sort((a, b) =>
        a.location_code.localeCompare(b.location_code, undefined, { numeric: true })
      );
      item.total_stock = item.locations.reduce((sum, l) => sum + Number(l.qty || 0), 0);

      SearchCache.set(sku, { item, timestamp: Date.now() });

      if (typeof AppState !== 'undefined' && AppState.lastSearch && AppState.lastSearch.sku === sku) {
        AppState.lastSearch = item;
        if (typeof renderSearchResult === 'function') {
          renderSearchResult(item);
        }
      }
    }
  }

}


function rollbackSearchCache(sku) {

  if (typeof SearchCache !== 'undefined' && SearchCache.has(sku)) {
    SearchCache.delete(sku);
  }

  if (
    typeof executeSearch === 'function' &&
    typeof AppState !== 'undefined' &&
    AppState.lastSearch?.sku === sku
  ) {
    executeSearch(sku, { backgroundSync: true, silent: true });
  }

}


function flashSubmitSuccess() {

  const button = document.getElementById('movementSubmitButton');
  if (!button) return;

  const originalContent = `
    <i data-lucide="check" class="h-5 w-5"></i>
    <span>Simpan Movement</span>
  `;

  button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
  button.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
  button.innerHTML = `
    <i data-lucide="circle-check" class="h-5 w-5"></i>
    <span>Tersimpan!</span>
  `;
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    button.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
    button.classList.add('bg-blue-600', 'hover:bg-blue-700');
    button.innerHTML = originalContent;
    if (window.lucide) lucide.createIcons();
  }, 500);

}


function updateMovementSuccessStatus(status, movementId) {

  const badge = document.getElementById('movementSuccessBadge');
  const badgeText = document.getElementById('movementSuccessBadgeText');
  const message = document.getElementById('movementSuccessMessage');

  if (!badge) return;

  if (status === 'synced') {
    badge.className = 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800';
    badge.innerHTML = `
      <i data-lucide="check" class="h-3 w-3"></i>
      <span>Tersinkron</span>
    `;
    if (movementId && message) {
      const parts = message.textContent.split(' · ID ');
      message.textContent = `${parts[0]} · ID ${movementId}`;
    }
  } else if (status === 'offline') {
    badge.className = 'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800';
    badge.innerHTML = `
      <i data-lucide="cloud-off" class="h-3 w-3"></i>
      <span>Tersimpan di HP</span>
    `;
  } else if (status === 'syncing') {
    badge.className = 'inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800';
    badge.innerHTML = `
      <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600"></span>
      <span>Menyinkronkan...</span>
    `;
  }

  if (window.lucide) lucide.createIcons();

}


function renderMovementSuccess(data) {

  const typeLabel = {
    IN: 'Barang masuk',
    OUT: 'Barang keluar',
    MOVE: 'Barang dipindahkan'
  }[data.type] || 'Movement berhasil';

  const message = document.getElementById('movementSuccessMessage');
  const successBox = document.getElementById('movementSuccess');

  if (!message || !successBox) {
    return;
  }

  let detail = `${typeLabel} · SKU ${data.sku || '-'} · Qty ${typeof formatNumber === 'function' ? formatNumber(data.movement_qty || 0) : (data.movement_qty || 0)}`;

  if (data.from_location || data.to_location) {
    const route = [data.from_location, data.to_location]
      .filter(Boolean)
      .join(' → ');

    if (route) {
      detail += ` · ${route}`;
    }
  }

  if (data.movement_id) {
    detail += ` · ID ${data.movement_id}`;
  }

  message.textContent = detail;
  successBox.classList.remove('hidden');

  updateMovementSuccessStatus(data.status || 'syncing', data.movement_id);

  if (window.lucide) {
    lucide.createIcons();
  }

}


function resetMovementForm() {

  const sku = document.getElementById('movementSku');
  const qty = document.getElementById('movementQty');
  const from = document.getElementById('movementFromLocation');
  const to = document.getElementById('movementToLocation');

  if (sku) sku.value = '';
  if (qty) qty.value = '';
  if (from) from.value = '';
  if (to) to.value = '';

}


function showMovementError(message) {

  // Bunyikan buzz error jika validasi movement gagal
  if (window.AudioFeedback) {
    window.AudioFeedback.playError();
  }

  const box = document.getElementById('movementError');
  const messageBox = document.getElementById('movementErrorMessage');

  if (!box || !messageBox) {
    return;
  }

  messageBox.textContent = message;
  box.classList.remove('hidden');

  if (window.lucide) {
    lucide.createIcons();
  }

}


function hideMovementError() {

  document.getElementById('movementError')?.classList.add('hidden');

  const message = document.getElementById('movementErrorMessage');
  if (message) {
    message.textContent = '';
  }

}


function hideMovementSuccess() {

  document.getElementById('movementSuccess')?.classList.add('hidden');

}
