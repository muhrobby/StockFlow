(function () {
  // State internal
  let selectedFile = null;
  let parsedRows = [];
  let lastResults = [];
  let isSubmitting = false;

  // DOM Elements Cache
  const elements = {
    modalUpload: document.getElementById('bulkUploadModal'),
    modalResult: document.getElementById('bulkResultModal'),
    modalSubtitle: document.getElementById('bulkModalSubtitle'),
    templateExample: document.getElementById('bulkTemplateExample'),
    btnOpenFromDashboard: document.getElementById('btnOpenBulkFromDashboard'),
    btnOpenFromMovement: document.getElementById('btnOpenBulkFromMovement'),
    btnCloseModal: document.getElementById('bulkModalCloseBtn'),
    btnCancelModal: document.getElementById('bulkModalCancelBtn'),
    btnDownloadTemplate: document.getElementById('bulkDownloadTemplateBtn'),
    btnSubmit: document.getElementById('bulkSubmitBtn'),
    submitLabel: document.getElementById('bulkSubmitLabel'),
    dropzone: document.getElementById('bulkDropzone'),
    fileInput: document.getElementById('bulkFileInput'),
    fileInfo: document.getElementById('bulkFileInfo'),
    fileName: document.getElementById('bulkFileName'),
    fileMeta: document.getElementById('bulkFileMeta'),
    btnRemoveFile: document.getElementById('bulkRemoveFileBtn'),
    errorAlert: document.getElementById('bulkErrorAlert'),
    errorMessage: document.getElementById('bulkErrorMessage'),
    labelModeAdd: document.getElementById('labelModeAdd'),
    labelModeSet: document.getElementById('labelModeSet'),
    // Result Modal Elements
    resultSuccessCount: document.getElementById('bulkSuccessCount'),
    resultFailedCount: document.getElementById('bulkFailedCount'),
    resultFailBox: document.getElementById('bulkResultFailBox'),
    resultSuccessBox: document.getElementById('bulkResultSuccessBox'),
    btnDownloadFeedback: document.getElementById('bulkDownloadFeedbackBtn'),
    btnResultClose: document.getElementById('bulkResultCloseBtn')
  };

  // ==========================================
  // 1. Template CSV Generator & Downloader
  // ==========================================
  function downloadTemplate() {
    const user = (window.AppState && window.AppState.user) || window.Auth?.getSession()?.user;
    const storeId = user?.default_store_id || 'STR-300';

    // Sesuaikan data contoh lokasi dengan store aktif pengguna (mencegah penolakan cross-store)
    let sampleRows = '228436,A-01-P10,10\n228438,A-01-P20,20\n';
    if (storeId === 'STR-301') {
      sampleRows = '228436,B-01-P10,10\n228438,C-01-P10,20\n';
    }

    const templateContent = `sku,location,qty\n${sampleRows}`;
    const filename = storeId ? `stock_template_${storeId}.csv` : 'stock_template.csv';

    triggerDownload(
      new Blob([templateContent], { type: 'text/csv;charset=utf-8;' }),
      filename
    );
  }

  // Helper trigger browser file download
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // 2. Client-Side CSV Parser & Pre-Validation
  // ==========================================
  function parseCSV(text) {
    // Hapus UTF-8 BOM jika ada
    const cleaned = text.replace(/^\uFEFF/, '');
    const rawLines = cleaned.split(/\r\n|\n|\r/);
    const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length === 0) {
      throw new Error('File CSV kosong.');
    }

    // Validasi Header
    const headerLine = lines[0].toLowerCase().replace(/\s+/g, '');
    const headers = headerLine.split(',');

    if (headers.length < 3 || headers[0] !== 'sku' || headers[1] !== 'location' || headers[2] !== 'qty') {
      throw new Error('Format header CSV tidak valid. Wajib: sku,location,qty');
    }

    if (lines.length === 1) {
      throw new Error('File CSV hanya memiliki header tanpa baris data.');
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(',').map(c => c.trim());
      const rowNumber = i + 1;

      if (cols.length < 3) {
        throw new Error(`Baris ${rowNumber} tidak lengkap (harus memiliki 3 kolom).`);
      }

      const sku = cols[0];
      const location = cols[1].toUpperCase();
      const rawQty = cols[2];
      const qty = Number(rawQty);

      if (!sku) {
        throw new Error(`Baris ${rowNumber}: SKU wajib diisi.`);
      }
      if (!location) {
        throw new Error(`Baris ${rowNumber}: Location wajib diisi.`);
      }
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error(`Baris ${rowNumber}: Qty harus angka bulat lebih besar dari 0.`);
      }

      rows.push({ sku, location, qty });
    }

    if (rows.length > 1000) {
      throw new Error('Jumlah baris melebihi batas maksimal (maksimal 1.000 baris per file).');
    }

    return rows;
  }

  // ==========================================
  // 3. Modal & UI State Management
  // ==========================================
  function openModal() {
    resetForm();
    const user = (window.AppState && window.AppState.user) || window.Auth?.getSession()?.user;
    const storeId = user?.default_store_id || '';

    if (elements.modalSubtitle) {
      elements.modalSubtitle.textContent = storeId
        ? `Impor data stok via file CSV (Store: ${storeId})`
        : 'Impor data stok via file CSV';
    }

    if (elements.templateExample) {
      const sampleLoc = storeId === 'STR-301' ? 'B-01-P10' : 'A-01-P10';
      elements.templateExample.textContent = `228436,${sampleLoc},10`;
    }

    if (elements.modalUpload) {
      elements.modalUpload.classList.remove('hidden');
      elements.modalUpload.classList.add('flex');
    }
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function closeModal() {
    if (elements.modalUpload) {
      elements.modalUpload.classList.add('hidden');
      elements.modalUpload.classList.remove('flex');
    }
    resetForm();
  }

  function resetForm() {
    selectedFile = null;
    parsedRows = [];
    isSubmitting = false;
    if (elements.fileInput) elements.fileInput.value = '';
    if (elements.fileInfo) elements.fileInfo.classList.add('hidden');
    if (elements.dropzone) elements.dropzone.classList.remove('hidden');
    hideError();
    updateSubmitState();
    // Reset radio mode ke ADD
    const radioAdd = document.querySelector('input[name="bulkMode"][value="ADD"]');
    if (radioAdd) radioAdd.checked = true;
    syncModeStyle();
  }

  function showError(msg) {
    if (window.AudioFeedback) {
      window.AudioFeedback.playError();
    }
    if (elements.errorAlert && elements.errorMessage) {
      elements.errorMessage.textContent = msg;
      elements.errorAlert.classList.remove('hidden');
    }
  }

  function hideError() {
    if (elements.errorAlert) {
      elements.errorAlert.classList.add('hidden');
    }
  }

  function updateSubmitState() {
    if (elements.btnSubmit) {
      elements.btnSubmit.disabled = !selectedFile || parsedRows.length === 0 || isSubmitting;
    }
  }

  function syncModeStyle() {
    const mode = document.querySelector('input[name="bulkMode"]:checked')?.value || 'ADD';
    if (mode === 'ADD') {
      elements.labelModeAdd?.classList.add('border-emerald-600', 'bg-emerald-50/40');
      elements.labelModeAdd?.classList.remove('border-slate-200', 'bg-slate-50/60');
      elements.labelModeSet?.classList.remove('border-emerald-600', 'bg-emerald-50/40');
      elements.labelModeSet?.classList.add('border-slate-200', 'bg-slate-50/60');
    } else {
      elements.labelModeSet?.classList.add('border-emerald-600', 'bg-emerald-50/40');
      elements.labelModeSet?.classList.remove('border-slate-200', 'bg-slate-50/60');
      elements.labelModeAdd?.classList.remove('border-emerald-600', 'bg-emerald-50/40');
      elements.labelModeAdd?.classList.add('border-slate-200', 'bg-slate-50/60');
    }
  }

  // ==========================================
  // 4. File Handler
  // ==========================================
  function handleFile(file) {
    hideError();
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      showError('Hanya file berformat .csv yang diperbolehkan.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const content = e.target.result;
        const rows = parseCSV(content);

        selectedFile = file;
        parsedRows = rows;

        // Update Info UI
        if (elements.fileName) elements.fileName.textContent = file.name;
        if (elements.fileMeta) {
          const sizeKb = (file.size / 1024).toFixed(1);
          elements.fileMeta.textContent = `${sizeKb} KB • ${rows.length} baris data`;
        }
        if (elements.dropzone) elements.dropzone.classList.add('hidden');
        if (elements.fileInfo) elements.fileInfo.classList.remove('hidden');
        updateSubmitState();
      } catch (err) {
        showError(err.message || 'Gagal membaca isi file CSV.');
        selectedFile = null;
        parsedRows = [];
        updateSubmitState();
      }
    };

    reader.onerror = function () {
      showError('Terjadi kesalahan saat membaca file.');
    };

    reader.readAsText(file);
  }

  // ==========================================
  // 5. Submit Bulk Upload
  // ==========================================
  async function submitBulk() {
    if (!selectedFile || parsedRows.length === 0 || isSubmitting) return;

    const user = (window.AppState && window.AppState.user) || window.Auth?.getSession()?.user;
    if (!user || !user.access_id) {
      showError('Sesi login telah berakhir. Silakan login kembali.');
      return;
    }
    if (!user.default_store_id) {
      showError('Data store tidak ditemukan di sesi. Silakan login kembali.');
      return;
    }

    const mode = document.querySelector('input[name="bulkMode"]:checked')?.value || 'ADD';

    isSubmitting = true;
    hideError();
    if (elements.btnSubmit) elements.btnSubmit.disabled = true;
    if (elements.submitLabel) elements.submitLabel.textContent = 'Memproses...';

    const payload = {
      mode,
      access_id: user.access_id,
      store_id: String(user.default_store_id || '').trim().toUpperCase(),
      items: parsedRows
    };

    try {
      const response = await window.Api.post('/warehouse/bulk-upload', payload, {
        timeoutMs: window.APP_CONFIG.BULK_REQUEST_TIMEOUT_MS
      });

      closeModal();
      handleSuccessResponse(response);
    } catch (err) {
      showError(err.message || 'Terjadi kesalahan pada server saat memproses bulk upload.');
    } finally {
      isSubmitting = false;
      if (elements.btnSubmit) {
        elements.btnSubmit.disabled = false;
        elements.submitLabel.textContent = 'Upload & Validasi';
      }
    }
  }

  // ==========================================
  // 6. Handle Response & Feedback Generator
  // ==========================================
  function handleSuccessResponse(res) {
    const summary = res.summary || {};
    const results = res.results || [];
    lastResults = results;

    const successCount = summary.success_count || 0;
    const failedCount = summary.failed_count || 0;

    if (elements.resultSuccessCount) elements.resultSuccessCount.textContent = successCount;
    if (elements.resultFailedCount) elements.resultFailedCount.textContent = failedCount;

    if (failedCount > 0) {
      if (window.AudioFeedback) {
        window.AudioFeedback.playError();
      }
      elements.resultFailBox?.classList.remove('hidden');
      elements.resultSuccessBox?.classList.add('hidden');
      elements.btnDownloadFeedback?.classList.remove('hidden');

      // Otomatis download file feedback
      downloadFeedbackCSV(results);
    } else {
      if (window.AudioFeedback) {
        window.AudioFeedback.playSuccess();
      }
      elements.resultFailBox?.classList.add('hidden');
      elements.resultSuccessBox?.classList.remove('hidden');
      elements.btnDownloadFeedback?.classList.add('hidden');
    }

    // Tampilkan Modal Result
    if (elements.modalResult) {
      elements.modalResult.classList.remove('hidden');
      elements.modalResult.classList.add('flex');
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function downloadFeedbackCSV(results) {
    if (!results || results.length === 0) return;

    const headers = ['sku', 'location', 'qty', 'status', 'feedback'];
    const rows = results.map(r => {
      const escapedFeedback = `"${String(r.feedback || '').replace(/"/g, '""')}"`;
      return `${r.sku},${r.location},${r.qty},${r.status},${escapedFeedback}`;
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const filename = `feedback_bulk_upload_${dateStr}_${timeStr}.csv`;

    triggerDownload(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
      filename
    );
  }

  // ==========================================
  // 7. Event Listeners Setup
  // ==========================================
  function setupEventListeners() {
    // Trigger Open Modal
    elements.btnOpenFromDashboard?.addEventListener('click', openModal);
    elements.btnOpenFromMovement?.addEventListener('click', openModal);

    // Close Upload Modal
    elements.btnCloseModal?.addEventListener('click', closeModal);
    elements.btnCancelModal?.addEventListener('click', closeModal);

    // Download Template
    elements.btnDownloadTemplate?.addEventListener('click', downloadTemplate);

    // Mode Radio Changed
    document.querySelectorAll('input[name="bulkMode"]').forEach(radio => {
      radio.addEventListener('change', syncModeStyle);
    });

    // File Input Change
    elements.fileInput?.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    });

    // Dropzone Click
    elements.dropzone?.addEventListener('click', () => {
      elements.fileInput?.click();
    });

    // Dropzone Drag and Drop
    if (elements.dropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        elements.dropzone.addEventListener(eventName, e => {
          e.preventDefault();
          e.stopPropagation();
          elements.dropzone.classList.add('border-emerald-500', 'bg-emerald-50/30');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        elements.dropzone.addEventListener(eventName, e => {
          e.preventDefault();
          e.stopPropagation();
          elements.dropzone.classList.remove('border-emerald-500', 'bg-emerald-50/30');
        });
      });

      elements.dropzone.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) {
          handleFile(dt.files[0]);
        }
      });
    }

    // Remove File
    elements.btnRemoveFile?.addEventListener('click', () => {
      resetForm();
    });

    // Submit
    elements.btnSubmit?.addEventListener('click', submitBulk);

    // Download Feedback Re-click
    elements.btnDownloadFeedback?.addEventListener('click', () => {
      downloadFeedbackCSV(lastResults);
    });

    // Close Result Modal
    elements.btnResultClose?.addEventListener('click', () => {
      if (elements.modalResult) {
        elements.modalResult.classList.add('hidden');
        elements.modalResult.classList.remove('flex');
      }
    });
  }

  // Inisialisasi saat DOM siap
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    if (window.lucide) window.lucide.createIcons();
  });

  window.BulkUpload = {
    openModal,
    closeModal,
    downloadTemplate
  };
})();
