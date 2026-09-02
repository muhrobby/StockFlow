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

  if (form) {
    form.addEventListener('submit', handleMovementSubmit);
  }

  if (type) {
    type.addEventListener('change', syncMovementForm);
  }

  if (scanButton) {
    scanButton.addEventListener('click', handleMovementScan);
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


async function handleMovementSubmit(event) {

  event.preventDefault();

  if (MovementState.loading) {
    return;
  }

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

  setMovementLoading(true);

  try {

    const result = await Api.post(
      '/warehouse/movement',
      payload
    );

    if (!result || result.success !== true) {
      throw new Error(
        result?.message || 'Movement gagal.'
      );
    }

    renderMovementSuccess(result.data || {});

    resetMovementForm();

    showToast('Movement berhasil disimpan.');

  } catch (error) {

    console.error('Movement error:', error);

    showMovementError(
      error.message || 'Terjadi kesalahan saat menyimpan movement.'
    );

  } finally {

    setMovementLoading(false);

  }

}


function setMovementLoading(loading) {

  MovementState.loading = loading;

  const button = document.getElementById('movementSubmitButton');
  const scanButton = document.getElementById('movementScanButton');

  if (!button) {
    return;
  }

  button.disabled = loading;

  if (scanButton) {
    scanButton.disabled = loading;
  }

  if (loading) {
    button.innerHTML = `
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"></div>
      <span>Menyimpan...</span>
    `;
  } else {
    button.innerHTML = `
      <i data-lucide="check" class="h-5 w-5"></i>
      <span>Simpan Movement</span>
    `;

    lucide.createIcons();
  }

}


function renderMovementSuccess(data) {

  const typeLabel = {
    IN: 'Barang masuk',
    OUT: 'Barang keluar',
    MOVE: 'Barang dipindahkan'
  }[data.type] || 'Movement berhasil';

  const message = document.getElementById('movementSuccessMessage');

  if (!message) {
    return;
  }

  let detail = `${typeLabel} · SKU ${data.sku || '-'} · Qty ${formatNumber(data.movement_qty || 0)}`;

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

  document
    .getElementById('movementSuccess')
    ?.classList.remove('hidden');

  lucide.createIcons();

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

  const box = document.getElementById('movementError');
  const messageBox = document.getElementById('movementErrorMessage');

  if (!box || !messageBox) {
    return;
  }

  messageBox.textContent = message;
  box.classList.remove('hidden');

  lucide.createIcons();

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
