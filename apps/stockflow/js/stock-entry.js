/**
 * StockFlow - Stock Entry & Stock Opname Module
 * Mode: SET (Stock Opname Fisik) & ADD (Inbound Tambah Stok)
 * Features: Lock Location, Native Searchable Combobox, Rapid Barcode Scanning,
 * Real-time Redis SKU Master Verification, Auto-Focus Qty, Batch Staging & Submit.
 */

(function () {
  const StockEntryState = {
    lockedLocation: null,
    mode: "SET", // 'SET' (Stock Opname) or 'ADD' (Inbound)
    stagedItems: [], // [{ sku, description, qty, oldStock, delta }]
    masterLocations: [], // [{ location_code, zone, section, position, store_id }]
    verifiedArticle: null, // { sku, description, oldStock } | null
    isSearchingSku: false,
    isSubmitting: false,
    comboboxOpen: false,
    searchDebounceTimer: null
  };

  /* =========================================
     DOM HELPERS & SELECTORS
  ========================================= */

  function getEl(id) {
    return document.getElementById(id);
  }

  /* =========================================
     INITIALIZATION & EVENT BINDING
  ========================================= */

  function init() {
    bindModeToggleEvents();
    bindLocationEvents();
    bindSkuInputEvents();
    bindQtyEvents();
    bindStagingActions();
    bindSubmitEvents();

    // Close combobox when clicking outside
    document.addEventListener("click", (e) => {
      const wrapper = getEl("locationComboboxWrapper");
      if (wrapper && !wrapper.contains(e.target)) {
        closeLocationCombobox();
      }
    });
  }

  /* =========================================
     MODE TOGGLE: OPNAME (SET) vs INBOUND (ADD)
  ========================================= */

  function bindModeToggleEvents() {
    const btnSet = getEl("btnStockEntryModeSet");
    const btnAdd = getEl("btnStockEntryModeAdd");

    if (btnSet) {
      btnSet.addEventListener("click", () => setMode("SET"));
    }
    if (btnAdd) {
      btnAdd.addEventListener("click", () => setMode("ADD"));
    }
  }

  function setMode(mode) {
    if (StockEntryState.mode === mode) return;
    StockEntryState.mode = mode;

    const btnSet = getEl("btnStockEntryModeSet");
    const btnAdd = getEl("btnStockEntryModeAdd");

    if (mode === "SET") {
      btnSet?.classList.add("bg-white", "text-slate-900", "shadow-sm");
      btnSet?.classList.remove("text-slate-500");
      btnAdd?.classList.remove("bg-white", "text-slate-900", "shadow-sm");
      btnAdd?.classList.add("text-slate-500");
    } else {
      btnAdd?.classList.add("bg-white", "text-slate-900", "shadow-sm");
      btnAdd?.classList.remove("text-slate-500");
      btnSet?.classList.remove("bg-white", "text-slate-900", "shadow-sm");
      btnSet?.classList.add("text-slate-500");
    }

    // Recalculate deltas for staged items
    StockEntryState.stagedItems.forEach((item) => {
      if (mode === "SET") {
        item.delta = item.qty - (item.oldStock || 0);
      } else {
        item.delta = item.qty;
      }
    });

    renderStagedTable();
    updateModeHeaders();
  }

  function updateModeHeaders() {
    const isSet = StockEntryState.mode === "SET";
    const modeLabel = getEl("stockEntryModeHeaderLabel");
    if (modeLabel) {
      modeLabel.textContent = isSet ? "Stock Opname (Fisik)" : "Tambah Stok (Inbound)";
    }
    const modeDesc = getEl("stockEntryModeDesc");
    if (modeDesc) {
      modeDesc.textContent = isSet
        ? "Menetapkan kuantitas fisik riil rak (sistem otomatis menghitung selisih)."
        : "Menambahkan kuantitas barang baru masuk ke rak terkunci.";
    }
  }

  /* =========================================
     LOCATION SELECTION & COMBOBOX
  ========================================= */

  async function loadStoreLocations() {
    const user = AppState.user;
    if (!user || !user.default_store_id) return;

    const storeId = user.default_store_id;
    const cacheKey = `stockflow_locs_${storeId}`;

    // Cek cache memori/session
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        StockEntryState.masterLocations = JSON.parse(cached);
        renderComboboxOptions(StockEntryState.masterLocations);
      }
    } catch (e) {}

    try {
      const res = await Api.getLocations(storeId);
      if (res && res.success && Array.isArray(res.locations)) {
        StockEntryState.masterLocations = res.locations;
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(res.locations));
        } catch (e) {}
        renderComboboxOptions(res.locations);
      }
    } catch (error) {
      console.warn("Gagal memuat master lokasi:", error);
    }
  }

  function bindLocationEvents() {
    const locInput = getEl("stockEntryLocationInput");
    const scanBtn = getEl("btnScanEntryLocation");
    const lockBtn = getEl("btnLockLocation");
    const unlockBtn = getEl("btnUnlockLocation");

    if (locInput) {
      locInput.addEventListener("focus", () => {
        if (!StockEntryState.lockedLocation) {
          openLocationCombobox();
          filterComboboxOptions(locInput.value);
        }
      });

      locInput.addEventListener("input", () => {
        filterComboboxOptions(locInput.value);
        openLocationCombobox();
      });

      locInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          closeLocationCombobox();
          lockCurrentLocation();
        } else if (e.key === "Escape") {
          closeLocationCombobox();
        }
      });
    }

    if (scanBtn) {
      scanBtn.addEventListener("click", () => {
        handleScanLocation();
      });
    }

    if (lockBtn) {
      lockBtn.addEventListener("click", () => {
        lockCurrentLocation();
      });
    }

    if (unlockBtn) {
      unlockBtn.addEventListener("click", () => {
        unlockCurrentLocation();
      });
    }
  }

  function openLocationCombobox() {
    const menu = getEl("locationComboboxMenu");
    if (menu) {
      menu.classList.remove("hidden");
      StockEntryState.comboboxOpen = true;
    }
  }

  function closeLocationCombobox() {
    const menu = getEl("locationComboboxMenu");
    if (menu) {
      menu.classList.add("hidden");
      StockEntryState.comboboxOpen = false;
    }
  }

  function filterComboboxOptions(query) {
    const q = String(query || "").trim().toUpperCase();
    const list = StockEntryState.masterLocations;
    if (!q) {
      renderComboboxOptions(list);
      return;
    }

    const filtered = list.filter((loc) => {
      const code = String(loc.location_code || "").toUpperCase();
      const zone = String(loc.zone || "").toUpperCase();
      const sec = String(loc.section || "").toUpperCase();
      return code.includes(q) || zone.includes(q) || sec.includes(q);
    });

    renderComboboxOptions(filtered);
  }

  function renderComboboxOptions(locations) {
    const container = getEl("locationComboboxList");
    if (!container) return;

    if (!locations || locations.length === 0) {
      container.innerHTML = `
        <div class="px-4 py-3 text-xs text-slate-400 text-center">
          Tidak ada rak ditemukan
        </div>
      `;
      return;
    }

    const displayList = locations.slice(0, 40);
    container.innerHTML = displayList
      .map(
        (loc) => `
        <button
          type="button"
          class="w-full text-left px-3.5 py-2.5 hover:bg-slate-100 flex items-center justify-between transition border-b border-slate-100 last:border-0"
          data-location="${loc.location_code}"
        >
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-900">${loc.location_code}</span>
            ${loc.zone ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Zona ${loc.zone}</span>` : ""}
          </div>
          <span class="text-[11px] text-slate-400">${loc.section ? "Seksi " + loc.section : ""}</span>
        </button>
      `
      )
      .join("");

    container.querySelectorAll("[data-location]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const code = btn.dataset.location;
        const input = getEl("stockEntryLocationInput");
        if (input) {
          input.value = code;
        }
        closeLocationCombobox();
        lockCurrentLocation();
      });
    });
  }

  async function handleScanLocation() {
    if (StockEntryState.lockedLocation) return;
    try {
      await Scanner.open((decodedText) => {
        const rawCode = String(decodedText || "").trim().toUpperCase();
        const input = getEl("stockEntryLocationInput");
        if (input) {
          input.value = rawCode;
        }
        showToast(`Lokasi terbaca: ${rawCode}`);
        lockCurrentLocation();
      });
    } catch (err) {
      showToast(err.message || "Gagal membuka kamera scanner.", "error");
    }
  }

  function lockCurrentLocation() {
    const input = getEl("stockEntryLocationInput");
    const code = String(input?.value || "").trim().toUpperCase();

    if (!code) {
      showToast("Pilih atau scan lokasi rak terlebih dahulu.", "error");
      input?.focus();
      return;
    }

    StockEntryState.lockedLocation = code;

    // Update UI elements
    if (input) input.disabled = true;
    const scanBtn = getEl("btnScanEntryLocation");
    if (scanBtn) scanBtn.disabled = true;

    const lockBtn = getEl("btnLockLocation");
    const unlockBtn = getEl("btnUnlockLocation");
    if (lockBtn) lockBtn.classList.add("hidden");
    if (unlockBtn) unlockBtn.classList.remove("hidden");

    const badge = getEl("lockedLocationBadge");
    if (badge) {
      badge.textContent = `🔒 Terkunci: ${code}`;
      badge.classList.remove("hidden");
    }

    // Activate Item Input & Staging panels
    const itemSection = getEl("stockEntryItemSection");
    const stagingSection = getEl("stockEntryStagingSection");
    if (itemSection) itemSection.classList.remove("hidden");
    if (stagingSection) stagingSection.classList.remove("hidden");

    closeLocationCombobox();

    // Auto-focus ke input SKU
    setTimeout(() => {
      const skuInput = getEl("stockEntrySkuInput");
      if (skuInput) {
        skuInput.focus();
      }
    }, 100);

    showToast(`Rak ${code} terkunci. Silakan scan atau input SKU barang.`);
  }

  function unlockCurrentLocation(force = false) {
    if (!force && StockEntryState.stagedItems.length > 0) {
      const confirmChange = window.confirm(
        `Masih ada ${StockEntryState.stagedItems.length} barang di rak ini yang belum disimpan. Yakin ingin mengganti rak dan mengosongkan daftar?`
      );
      if (!confirmChange) return;
    }

    StockEntryState.lockedLocation = null;
    StockEntryState.stagedItems = [];
    StockEntryState.verifiedArticle = null;

    const input = getEl("stockEntryLocationInput");
    if (input) {
      input.disabled = false;
      input.value = "";
      input.focus();
    }

    const scanBtn = getEl("btnScanEntryLocation");
    if (scanBtn) scanBtn.disabled = false;

    const lockBtn = getEl("btnLockLocation");
    const unlockBtn = getEl("btnUnlockLocation");
    if (lockBtn) lockBtn.classList.remove("hidden");
    if (unlockBtn) unlockBtn.classList.add("hidden");

    const badge = getEl("lockedLocationBadge");
    if (badge) badge.classList.add("hidden");

    const itemSection = getEl("stockEntryItemSection");
    const stagingSection = getEl("stockEntryStagingSection");
    if (itemSection) itemSection.classList.add("hidden");
    if (stagingSection) stagingSection.classList.add("hidden");

    clearVerifiedCard();
    renderStagedTable();
    if (!force) {
      showToast("Lokasi dibuka kembali. Silakan pilih rak baru.");
    }
  }

  /* =========================================
     SKU LOOKUP & VERIFICATION (REDIS < 20 MS)
  ========================================= */

  function bindSkuInputEvents() {
    const skuInput = getEl("stockEntrySkuInput");
    const scanSkuBtn = getEl("btnScanEntrySku");

    if (skuInput) {
      skuInput.addEventListener("input", () => {
        clearTimeout(StockEntryState.searchDebounceTimer);
        const val = String(skuInput.value || "").trim().replace(/\s+/g, "");
        if (val.length >= 3) {
          StockEntryState.searchDebounceTimer = setTimeout(() => {
            lookupSkuMaster(val);
          }, 350);
        } else {
          clearVerifiedCard();
        }
      });

      skuInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const val = String(skuInput.value || "").trim().replace(/\s+/g, "");
          if (val) {
            lookupSkuMaster(val, true);
          }
        }
      });
    }

    if (scanSkuBtn) {
      scanSkuBtn.addEventListener("click", () => {
        handleScanSku();
      });
    }
  }

  async function handleScanSku() {
    if (!StockEntryState.lockedLocation) {
      showToast("Kunci lokasi rak terlebih dahulu.", "error");
      return;
    }

    try {
      await Scanner.open((decodedText) => {
        const rawSku = String(decodedText || "").trim().replace(/\s+/g, "");
        const skuInput = getEl("stockEntrySkuInput");
        if (skuInput) {
          skuInput.value = rawSku;
        }

        // Cek apakah SKU sudah ada di staged list (Auto-increment langsung jika repeat scan)
        const existing = StockEntryState.stagedItems.find((i) => i.sku === rawSku);
        if (existing) {
          existing.qty += 1;
          if (StockEntryState.mode === "SET") {
            existing.delta = existing.qty - (existing.oldStock || 0);
          } else {
            existing.delta = existing.qty;
          }
          renderStagedTable();
          if (window.AudioFeedback) {
            window.AudioFeedback.playSuccess();
          }
          if (navigator.vibrate) navigator.vibrate([40]);
          showToast(`SKU ${rawSku} +1 pcs (Total: ${existing.qty} pcs)`);

          // Bersihkan input SKU agar siap scan barcode berikutnya
          if (skuInput) {
            skuInput.value = "";
            skuInput.focus();
          }
          clearVerifiedCard();
          return;
        }

        // Jika SKU baru, lookup ke Redis dan auto-focus ke Qty
        lookupSkuMaster(rawSku, true);
      });
    } catch (err) {
      showToast(err.message || "Gagal membuka kamera scanner.", "error");
    }
  }

  async function lookupSkuMaster(sku, autoFocusQty = false) {
    if (!sku || StockEntryState.isSearchingSku) return;

    const user = AppState.user;
    const storeId = user?.default_store_id || "";

    setSkuSearchingState(true);

    try {
      const res = await Api.post("/warehouse/search", {
        sku,
        store_id: storeId
      });

      if (res && res.success && res.item) {
        const item = res.item;
        const currentLocStock = (item.locations || []).find(
          (l) => l.location_code === StockEntryState.lockedLocation
        );
        const oldQty = currentLocStock ? Number(currentLocStock.qty || 0) : 0;

        StockEntryState.verifiedArticle = {
          sku: item.sku,
          description: item.description || "Nama Produk",
          oldStock: oldQty
        };

        renderVerifiedCard(StockEntryState.verifiedArticle);

        if (window.AudioFeedback) {
          window.AudioFeedback.playSuccess();
        }

        // AUTO-FOCUS ke input Qty agar operator yang sudah menghitung fisik bisa langsung ketik
        if (autoFocusQty) {
          setTimeout(() => {
            const qtyInput = getEl("stockEntryQtyInput");
            if (qtyInput) {
              qtyInput.value = "1";
              qtyInput.focus();
              qtyInput.select();
            }
          }, 80);
        }
      } else {
        handleInvalidSku(sku, res?.message || "SKU tidak ditemukan di database.");
      }
    } catch (error) {
      handleInvalidSku(sku, error.message || "Gagal memverifikasi SKU.");
    } finally {
      setSkuSearchingState(false);
    }
  }

  function setSkuSearchingState(searching) {
    StockEntryState.isSearchingSku = searching;
    const indicator = getEl("skuSearchSpinner");
    if (indicator) {
      if (searching) {
        indicator.classList.remove("hidden");
      } else {
        indicator.classList.add("hidden");
      }
    }
  }

  function renderVerifiedCard(article) {
    const card = getEl("verifiedArticleCard");
    const errorBox = getEl("skuErrorCard");
    const addBtn = getEl("btnAddStagedItem");

    if (errorBox) errorBox.classList.add("hidden");

    if (card && article) {
      const nameEl = getEl("verifiedArticleName");
      const skuEl = getEl("verifiedArticleSku");
      const stockEl = getEl("verifiedArticleCurrentStock");

      if (nameEl) nameEl.textContent = article.description;
      if (skuEl) skuEl.textContent = `SKU: ${article.sku}`;
      if (stockEl) {
        stockEl.textContent = `Stok saat ini di rak ${StockEntryState.lockedLocation}: ${article.oldStock} pcs`;
      }

      card.classList.remove("hidden");
      if (addBtn) addBtn.disabled = false;
    }
  }

  function handleInvalidSku(sku, message) {
    StockEntryState.verifiedArticle = null;
    const card = getEl("verifiedArticleCard");
    const errorBox = getEl("skuErrorCard");
    const errorMsg = getEl("skuErrorMessage");
    const addBtn = getEl("btnAddStagedItem");

    if (card) card.classList.add("hidden");

    if (errorBox) {
      if (errorMsg) {
        errorMsg.textContent = `${sku}: ${message || "SKU tidak terdaftar di database master."}`;
      }
      errorBox.classList.remove("hidden");
    }

    if (addBtn) addBtn.disabled = true;

    if (window.AudioFeedback) {
      window.AudioFeedback.playError();
    }
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }

  function clearVerifiedCard() {
    StockEntryState.verifiedArticle = null;
    const card = getEl("verifiedArticleCard");
    const errorBox = getEl("skuErrorCard");
    const addBtn = getEl("btnAddStagedItem");

    if (card) card.classList.add("hidden");
    if (errorBox) errorBox.classList.add("hidden");
    if (addBtn) addBtn.disabled = true;
  }

  /* =========================================
     MANUAL QTY & STAGING ITEM ADDITION
  ========================================= */

  function bindQtyEvents() {
    const qtyInput = getEl("stockEntryQtyInput");
    const btnMinus = getEl("btnQtyMinus");
    const btnPlus = getEl("btnQtyPlus");
    const btnAdd1 = getEl("btnQuickAdd1");
    const btnAdd5 = getEl("btnQuickAdd5");
    const btnAdd10 = getEl("btnQuickAdd10");
    const btnAdd = getEl("btnAddStagedItem");

    if (btnMinus) {
      btnMinus.addEventListener("click", () => {
        if (!qtyInput) return;
        const current = parseInt(qtyInput.value, 10) || 0;
        const min = StockEntryState.mode === "SET" ? 0 : 1;
        qtyInput.value = Math.max(min, current - 1);
      });
    }

    if (btnPlus) {
      btnPlus.addEventListener("click", () => {
        if (!qtyInput) return;
        const current = parseInt(qtyInput.value, 10) || 0;
        qtyInput.value = current + 1;
      });
    }

    if (btnAdd1) {
      btnAdd1.addEventListener("click", () => {
        if (!qtyInput) return;
        const current = parseInt(qtyInput.value, 10) || 0;
        qtyInput.value = current + 1;
      });
    }

    if (btnAdd5) {
      btnAdd5.addEventListener("click", () => {
        if (!qtyInput) return;
        const current = parseInt(qtyInput.value, 10) || 0;
        qtyInput.value = current + 5;
      });
    }

    if (btnAdd10) {
      btnAdd10.addEventListener("click", () => {
        if (!qtyInput) return;
        const current = parseInt(qtyInput.value, 10) || 0;
        qtyInput.value = current + 10;
      });
    }

    if (qtyInput) {
      qtyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitCurrentItemToStaging();
        }
      });
    }

    if (btnAdd) {
      btnAdd.addEventListener("click", () => {
        submitCurrentItemToStaging();
      });
    }
  }

  function submitCurrentItemToStaging() {
    const article = StockEntryState.verifiedArticle;
    if (!article) {
      showToast("Scan atau verifikasi SKU barang terlebih dahulu.", "error");
      getEl("stockEntrySkuInput")?.focus();
      return;
    }

    const qtyInput = getEl("stockEntryQtyInput");
    const qtyVal = parseInt(qtyInput?.value, 10);

    if (isNaN(qtyVal) || qtyVal < 0) {
      showToast("Kuantitas harus berupa angka bulat positif.", "error");
      qtyInput?.focus();
      return;
    }

    if (StockEntryState.mode === "ADD" && qtyVal <= 0) {
      showToast("Untuk penambahan stok (Inbound), kuantitas harus lebih dari 0.", "error");
      qtyInput?.focus();
      return;
    }

    const sku = article.sku;
    const existingIndex = StockEntryState.stagedItems.findIndex((i) => i.sku === sku);

    if (existingIndex >= 0) {
      const existing = StockEntryState.stagedItems[existingIndex];
      if (StockEntryState.mode === "SET") {
        existing.qty = qtyVal;
        existing.delta = qtyVal - (existing.oldStock || 0);
      } else {
        existing.qty += qtyVal;
        existing.delta = existing.qty;
      }
      showToast(`SKU ${sku} diperbarui menjadi ${existing.qty} pcs.`);
    } else {
      const newItem = {
        sku: article.sku,
        description: article.description,
        qty: qtyVal,
        oldStock: article.oldStock,
        delta: StockEntryState.mode === "SET" ? qtyVal - article.oldStock : qtyVal
      };
      StockEntryState.stagedItems.push(newItem);
      showToast(`SKU ${sku} (${qtyVal} pcs) ditambahkan ke daftar rak.`);
    }

    if (window.AudioFeedback) {
      window.AudioFeedback.playSuccess();
    }
    if (navigator.vibrate) {
      navigator.vibrate([30]);
    }

    renderStagedTable();

    // Reset Form Input dan kembalikan fokus ke SKU
    clearVerifiedCard();
    const skuInput = getEl("stockEntrySkuInput");
    if (skuInput) {
      skuInput.value = "";
      skuInput.focus();
    }
    if (qtyInput) {
      qtyInput.value = "1";
    }
  }

  /* =========================================
     STAGING TABLE RENDERING & ROW ACTIONS
  ========================================= */

  function bindStagingActions() {
    const clearBtn = getEl("btnClearStagedItems");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (StockEntryState.stagedItems.length === 0) return;
        if (window.confirm("Kosongkan seluruh daftar barang yang sedang didata di rak ini?")) {
          StockEntryState.stagedItems = [];
          renderStagedTable();
          showToast("Daftar barang rak dikosongkan.");
        }
      });
    }
  }

  function renderStagedTable() {
    const tbody = getEl("stagedTableBody");
    const mobileContainer = getEl("stagedMobileList");
    const emptyState = getEl("stagedEmptyState");
    const countBadge = getEl("stagedTotalCountBadge");
    const sumSku = getEl("stagedSummarySkus");
    const sumPcs = getEl("stagedSummaryPcs");
    const submitBtn = getEl("btnSubmitStockEntry");
    const isSet = StockEntryState.mode === "SET";

    const items = StockEntryState.stagedItems;
    const totalSkus = items.length;
    const totalPcs = items.reduce((sum, item) => sum + item.qty, 0);

    if (countBadge) countBadge.textContent = `${totalSkus} SKU`;
    if (sumSku) sumSku.textContent = `${totalSkus} SKU`;
    if (sumPcs) sumPcs.textContent = `${totalPcs} Pcs`;

    if (submitBtn) {
      submitBtn.disabled = totalSkus === 0 || StockEntryState.isSubmitting;
      submitBtn.innerHTML = `
        <i data-lucide="check-circle-2" class="h-5 w-5"></i>
        <span>Simpan Data Rak Ini (${totalSkus} SKU · ${totalPcs} Pcs)</span>
      `;
    }

    if (totalSkus === 0) {
      if (tbody) tbody.innerHTML = "";
      if (mobileContainer) mobileContainer.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    // 1. Render Mobile-First Cards (< sm)
    if (mobileContainer) {
      mobileContainer.innerHTML = items
        .map((item, idx) => {
          let badgeHtml = "";
          if (isSet) {
            const delta = item.delta;
            const sign = delta > 0 ? `+${delta}` : delta === 0 ? "0" : `${delta}`;
            const colorClass =
              delta > 0
                ? "text-emerald-700 bg-emerald-50 ring-emerald-200"
                : delta < 0
                ? "text-rose-700 bg-rose-50 ring-rose-200"
                : "text-slate-600 bg-slate-100 ring-slate-200";
            badgeHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${colorClass}">Selisih: ${sign}</span>`;
          } else {
            badgeHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 text-blue-700 bg-blue-50 ring-blue-200">+${item.qty} Inbound</span>`;
          }

          return `
            <div class="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-slate-300">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="font-mono text-sm font-black text-slate-900">${item.sku}</span>
                    ${badgeHtml}
                  </div>
                  <h4 class="mt-1 text-xs font-semibold text-slate-600 line-clamp-2">${item.description || "-"}</h4>
                </div>
                <button
                  type="button"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 active:scale-90"
                  onclick="StockEntry.removeItem(${idx})"
                  title="Hapus barang ini"
                >
                  <i data-lucide="trash-2" class="h-4 w-4"></i>
                </button>
              </div>

              <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div class="text-[11px] text-slate-500">
                  ${
                    isSet
                      ? `Stok Sistem: <strong class="font-bold text-slate-700">${item.oldStock || 0}</strong> pcs`
                      : `<span class="text-slate-400">Penambahan Stok</span>`
                  }
                </div>
                <div class="inline-flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-black text-slate-700 shadow-xs hover:bg-slate-200 active:scale-95 text-sm"
                    onclick="StockEntry.updateItemQty(${idx}, -1)"
                  >-</button>
                  <span class="w-10 text-center text-sm font-black text-slate-900">${item.qty}</span>
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-black text-slate-700 shadow-xs hover:bg-slate-200 active:scale-95 text-sm"
                    onclick="StockEntry.updateItemQty(${idx}, 1)"
                  >+</button>
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // 2. Render Desktop Table (>= sm)
    if (tbody) {
      tbody.innerHTML = items
        .map((item, idx) => {
          let deltaHtml = "";
          if (isSet) {
            const delta = item.delta;
            const sign = delta > 0 ? `+${delta}` : delta === 0 ? "0" : `${delta}`;
            const colorClass =
              delta > 0
                ? "text-emerald-700 bg-emerald-50 ring-emerald-200"
                : delta < 0
                ? "text-rose-700 bg-rose-50 ring-rose-200"
                : "text-slate-600 bg-slate-50 ring-slate-200";
            deltaHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${colorClass}">${sign}</span>`;
          } else {
            deltaHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 text-blue-700 bg-blue-50 ring-blue-200">+${item.qty}</span>`;
          }

          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50/60 transition">
            <td class="py-3 px-3">
              <div class="font-bold text-slate-900 text-sm">${item.sku}</div>
              <div class="text-xs text-slate-500 truncate max-w-[180px] sm:max-w-[260px]">${item.description}</div>
            </td>
            <td class="py-3 px-3 text-center text-xs font-semibold text-slate-500">
              ${isSet ? item.oldStock : "-"}
            </td>
            <td class="py-3 px-3 text-center">
              <div class="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  type="button"
                  class="w-6 h-6 rounded bg-white text-slate-700 hover:bg-slate-200 font-bold flex items-center justify-center text-xs shadow-xs"
                  onclick="StockEntry.updateItemQty(${idx}, -1)"
                >-</button>
                <span class="w-8 text-center text-sm font-black text-slate-900">${item.qty}</span>
                <button
                  type="button"
                  class="w-6 h-6 rounded bg-white text-slate-700 hover:bg-slate-200 font-bold flex items-center justify-center text-xs shadow-xs"
                  onclick="StockEntry.updateItemQty(${idx}, 1)"
                >+</button>
              </div>
            </td>
            <td class="py-3 px-3 text-center">${deltaHtml}</td>
            <td class="py-3 px-3 text-right">
              <button
                type="button"
                class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition"
                onclick="StockEntry.removeItem(${idx})"
                title="Hapus dari daftar"
              >
                <i data-lucide="trash-2" class="h-4 w-4"></i>
              </button>
            </td>
          </tr>
        `;
        })
        .join("");
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function updateItemQty(index, change) {
    if (index < 0 || index >= StockEntryState.stagedItems.length) return;
    const item = StockEntryState.stagedItems[index];
    const min = StockEntryState.mode === "SET" ? 0 : 1;
    item.qty = Math.max(min, item.qty + change);

    if (StockEntryState.mode === "SET") {
      item.delta = item.qty - (item.oldStock || 0);
    } else {
      item.delta = item.qty;
    }

    renderStagedTable();
  }

  function removeItem(index) {
    if (index < 0 || index >= StockEntryState.stagedItems.length) return;
    const removed = StockEntryState.stagedItems.splice(index, 1)[0];
    renderStagedTable();
    showToast(`SKU ${removed.sku} dihapus dari daftar.`);
  }

  /* =========================================
     FORM RESET & SUBMIT HANDLER
  ========================================= */

  function resetAllForms() {
    StockEntryState.lockedLocation = null;
    StockEntryState.stagedItems = [];
    StockEntryState.verifiedArticle = null;

    // Reset Input Lokasi & Tombol Scan
    const locInput = getEl("stockEntryLocationInput");
    if (locInput) {
      locInput.disabled = false;
      locInput.value = "";
    }

    const scanBtn = getEl("btnScanEntryLocation");
    if (scanBtn) scanBtn.disabled = false;

    const lockBtn = getEl("btnLockLocation");
    const unlockBtn = getEl("btnUnlockLocation");
    if (lockBtn) lockBtn.classList.remove("hidden");
    if (unlockBtn) unlockBtn.classList.add("hidden");

    const badge = getEl("lockedLocationBadge");
    if (badge) badge.classList.add("hidden");

    // Sembunyikan Panel 2 (SKU) dan Panel 3 (Staging)
    const itemSection = getEl("stockEntryItemSection");
    const stagingSection = getEl("stockEntryStagingSection");
    if (itemSection) itemSection.classList.add("hidden");
    if (stagingSection) stagingSection.classList.add("hidden");

    // Reset input SKU & Qty
    const skuInput = getEl("stockEntrySkuInput");
    if (skuInput) skuInput.value = "";
    const qtyInput = getEl("stockEntryQtyInput");
    if (qtyInput) qtyInput.value = "1";

    clearVerifiedCard();
    renderStagedTable();

    // Fokuskan kursor kembali ke input lokasi agar operator langsung siap ketik / scan lokasi berikutnya
    setTimeout(() => {
      if (locInput) locInput.focus();
    }, 120);
  }

  function bindSubmitEvents() {
    const submitBtn = getEl("btnSubmitStockEntry");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        submitBatch();
      });
    }
  }

  async function submitBatch() {
    if (!StockEntryState.lockedLocation) {
      showToast("Lokasi rak belum terkunci.", "error");
      return;
    }

    const items = [...StockEntryState.stagedItems];
    if (items.length === 0) {
      showToast("Belum ada barang di daftar rak ini.", "error");
      return;
    }

    const user = (window.AppState && window.AppState.user) || window.Auth?.getSession()?.user;
    if (!user || !user.access_id) {
      showToast("Sesi login berakhir. Silakan login kembali.", "error");
      return;
    }

    const locCode = StockEntryState.lockedLocation;
    const storeId = user.default_store_id;
    const mode = StockEntryState.mode;
    const totalSkus = items.length;
    const totalPcs = items.reduce((sum, item) => sum + item.qty, 0);
    const tempBatchId = `BATCH-${locCode}-${Date.now().toString().slice(-4)}`;

    const trackingPayload = {
      type: mode, // 'SET' (Stock Opname) atau 'ADD' (Inbound)
      sku: `${totalSkus} SKU (${totalPcs} pcs)`,
      qty: totalPcs,
      from_location: mode === "SET" ? locCode : "",
      to_location: locCode,
      access_id: user.access_id
    };

    const apiPayload = {
      access_id: user.access_id,
      store_id: storeId,
      location_code: locCode,
      mode,
      items: items.map((i) => ({ sku: i.sku, qty: i.qty }))
    };

    // 1. Berikan respon instan ke operator (0 ms perceived latency)
    if (window.AudioFeedback) {
      window.AudioFeedback.playSuccess();
    }
    if (navigator.vibrate) {
      navigator.vibrate([40, 30, 40]);
    }

    showToast(`💾 Menyimpan Rak ${locCode} (${totalSkus} SKU · ${totalPcs} Pcs) di latar belakang...`, "info");

    // 2. Daftarkan antrean ke SyncTracker (lonceng header berputar & counter in-flight bertambah)
    if (window.SyncTracker && typeof window.SyncTracker.addInFlight === "function") {
      window.SyncTracker.addInFlight(tempBatchId, trackingPayload);
    }

    // 3. Reset total semua form seketika sehingga operator bisa langsung mendata rak selanjutnya!
    resetAllForms();

    // 4. Eksekusi API di latar belakang (background sync)
    (async () => {
      try {
        const res = await Api.submitBatchLocationEntry(apiPayload);
        if (res && res.success) {
          // Update status di SyncTracker ke selesai
          if (window.SyncTracker && typeof window.SyncTracker.markCompleted === "function") {
            window.SyncTracker.markCompleted(tempBatchId, trackingPayload, {
              movement_id: res.batch_id || `MOV-${locCode}-${Date.now().toString().slice(-4)}`
            });
          }
          if (window.AudioFeedback) {
            window.AudioFeedback.playSuccess();
          }
          if (navigator.vibrate) {
            navigator.vibrate([60, 40, 60]);
          }
          // Notifikasi hijau sukses yang jelas & bertahan 4 detik
          showToast(`✅ Berhasil: Data rak ${locCode} (${totalSkus} SKU · ${totalPcs} Pcs) tersimpan ke cloud!`, "success");
        } else {
          throw new Error(res?.message || "Gagal menyimpan data rak ke server.");
        }
      } catch (error) {
        console.error("Gagal sinkronisasi rak:", error);
        if (window.SyncTracker && typeof window.SyncTracker.markFailed === "function") {
          window.SyncTracker.markFailed(tempBatchId);
        }
        if (window.AudioFeedback) {
          window.AudioFeedback.playError();
        }
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        showToast(`❌ Gagal menyimpan rak ${locCode}: ${error.message}`, "error");

        // Masukkan ke antrean offline jika offline / gangguan koneksi
        if (window.QueueManager && typeof window.QueueManager.enqueue === "function") {
          window.QueueManager.enqueue({
            type: "BATCH_ENTRY",
            payload: apiPayload,
            timestamp: Date.now(),
            description: `Rak ${locCode} (${totalSkus} SKU · ${totalPcs} pcs)`
          });
          showToast(`📦 Data rak ${locCode} diamankan di antrean offline HP.`, "info");
        }
      }
    })();
  }

  /* =========================================
     EXPORTS & AUTO-INITIALIZATION
  ========================================= */

  let isInitialized = false;
  function safeInit() {
    if (isInitialized) return;
    isInitialized = true;
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit);
  } else {
    safeInit();
  }

  window.StockEntry = {
    init: safeInit,
    loadStoreLocations,
    setMode,
    updateItemQty,
    removeItem,
    submitBatch,
    resetAllForms
  };
})();
