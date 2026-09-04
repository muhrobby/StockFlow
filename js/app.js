const AppState = {
  user: null,

  currentPage: "dashboard",

  loginLoading: false,

  searchLoading: false,

  lastSearch: null,
};

// In-Memory Search Cache untuk pencarian kilat (0 ms)
const SearchCache = new Map();

function getSearchCacheKey(sku) {
  const userRole = String(AppState.user?.role || "").toUpperCase();
  const allowedStores = String(AppState.user?.allowed_stores || "").trim().toUpperCase();
  const isMultiStore =
    ["SUPER_ADMIN", "SUPER ADMIN", "OPS"].includes(userRole) &&
    allowedStores === "*";
  const storeKey = isMultiStore
    ? "ALL"
    : String(AppState.user?.default_store_id || "").trim().toUpperCase();
  return `${storeKey}:${sku}`;
}

/* =========================================
   INIT
========================================= */

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  lucide.createIcons();

  Scanner.init();

  QueueManager.init();

  SyncTracker.init();

  if (window.AudioFeedback) {
    window.AudioFeedback.updateToggleUI();
  }

  bindEvents();

  bootstrap();
}

/* =========================================
   EVENTS
========================================= */

function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);

  document
    .getElementById("searchForm")
    .addEventListener("submit", handleSearch);

  document
    .getElementById("scanCameraButton")
    .addEventListener("click", handleOpenScanner);

  document
    .getElementById("desktopLogoutButton")
    .addEventListener("click", logout);

  document
    .getElementById("mobileLogoutButton")
    .addEventListener("click", logout);

  // Audio Beep Feedback Toggle
  const btnToggleAudio = document.getElementById("btnToggleAudio");
  if (btnToggleAudio) {
    btnToggleAudio.addEventListener("click", async () => {
      if (window.AudioFeedback) {
        const newState = await window.AudioFeedback.toggleAudio();
        showToast(newState ? "Suara beep diaktifkan" : "Suara beep dimatikan");
      }
    });
  }

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.page);
    });
  });

  bindQuickMovementEvents();

  // Offline Queue & Error Modal Events
  document
    .getElementById("offlineQueueSyncBtn")
    ?.addEventListener("click", () => {
      QueueManager.processQueue();
    });

  document
    .getElementById("errorModalCloseBtn")
    ?.addEventListener("click", () => {
      closeErrorModal();
    });

  // Tombol Refresh Hasil Pencarian
  document
    .getElementById("btnRefreshSearch")
    ?.addEventListener("click", () => {
      const sku = AppState.lastSearch?.sku;
      if (sku) {
        showToast(`Memperbarui stok SKU ${sku} dari cloud...`);
        executeSearch(sku, { skipCache: true });
      }
    });

  window.addEventListener("online", () => {
    showToast("Koneksi online kembali. Menyinkronkan...");
    QueueManager.processQueue();
  });
}

/* =========================================
   BOOTSTRAP
========================================= */

function bootstrap() {
  const session = Auth.getSession();

  if (session && session.user) {
    AppState.user = session.user;

    showApp();

    navigateTo("dashboard");

    return;
  }

  showLogin();
}

/* =========================================
   LOGIN
========================================= */

async function handleLogin(event) {
  event.preventDefault();

  if (AppState.loginLoading) {
    return;
  }

  const nikInput = document.getElementById("nikInput");

  const access_id = normalizeValue(nikInput.value);

  hideLoginError();

  if (!access_id) {
    showLoginError("Masukkan Access ID terlebih dahulu.");

    nikInput.focus();

    return;
  }

  setLoginLoading(true);

  try {
    const result = await Auth.login(access_id);

    if (!result || result.success !== true) {
      throw new Error(result?.message || "Login gagal.");
    }

    if (!result.user) {
      throw new Error("Data user tidak ditemukan.");
    }

    Auth.saveSession(result.user);

    AppState.user = result.user;

    showApp();

    navigateTo("dashboard");

    showToast(`Selamat datang, ${result.user.nama || result.user.access_id}`);
  } catch (error) {
    console.error("Login error:", error);

    showLoginError(error.message || "Terjadi kesalahan saat login.");

    nikInput.focus();
  } finally {
    setLoginLoading(false);
  }
}

/* =========================================
   MANUAL SEARCH
========================================= */

async function handleSearch(event) {
  event.preventDefault();

  const skuInput = document.getElementById("skuInput");

  const sku = normalizeValue(skuInput.value);

  if (!sku) {
    clearSearchResult();

    showSearchError("Masukkan SKU terlebih dahulu.");

    skuInput.focus();

    return;
  }

  await executeSearch(sku);
}

/* =========================================
   CAMERA SCANNER
========================================= */

async function handleOpenScanner() {
  if (AppState.searchLoading) {
    return;
  }

  hideSearchError();

  try {
    await Scanner.open(async (decodedText) => {
      const sku = normalizeValue(decodedText);

      if (!sku) {
        showSearchError("Barcode tidak menghasilkan SKU yang valid.");

        return;
      }

      const skuInput = document.getElementById("skuInput");

      skuInput.value = sku;

      showToast(`SKU terbaca: ${sku}`);

      await executeSearch(sku);
    });
  } catch (error) {
    console.error("Scanner error:", error);

    showSearchError(error.message || "Kamera tidak dapat dibuka.");
  }
}

/* =========================================
   EXECUTE SEARCH
========================================= */

async function executeSearch(sku, options = {}) {
  if (AppState.searchLoading) {
    return;
  }

  hideSearchError();

  const userRole = String(AppState.user?.role || "").toUpperCase();
  const allowedStores = String(AppState.user?.allowed_stores || "").trim().toUpperCase();
  const isMultiStore =
    ["SUPER_ADMIN", "SUPER ADMIN", "OPS"].includes(userRole) &&
    allowedStores === "*";
  const store_id = isMultiStore ? "*" : String(AppState.user?.default_store_id || "").trim().toUpperCase();
  const cacheKey = getSearchCacheKey(sku);

  // Jika skipCache diminta (misal tombol Refresh), hapus dari cache lokal browser
  if (options.skipCache === true) {
    SearchCache.delete(cacheKey);
  }

  // 1. Cek In-Memory Cache untuk respon instan (0 ms) - Stale-While-Revalidate
  let servedFromCache = false;
  if (options.skipCache !== true && SearchCache.has(cacheKey)) {
    const cached = SearchCache.get(cacheKey);
    // Cache valid untuk render kilat 0 ms selama 60 detik
    if (Date.now() - cached.timestamp < 60000) {
      AppState.lastSearch = cached.item;
      renderSearchResult(cached.item);
      servedFromCache = true;
    }
  }

  // Jika belum ada data di cache atau skipCache diminta, tampilkan skeleton loading
  if (!servedFromCache && !options.silent) {
    clearSearchResult();
    setSearchLoading(true);
  }

  try {
    const result = await Api.post("/warehouse/search", {
      sku,
      store_id,
      role: AppState.user?.role || "USER",
      allowed_stores: AppState.user?.allowed_stores || "",
      access_id: AppState.user?.access_id || "",
      skip_cache: options.skipCache === true,
      force_refresh: options.skipCache === true,
    });

    if (!result || result.success !== true) {
      throw new Error(result?.message || "Barang tidak ditemukan.");
    }

    if (!result.item) {
      throw new Error("Response barang tidak valid.");
    }

    AppState.lastSearch = result.item;
    SearchCache.set(cacheKey, { item: result.item, timestamp: Date.now() });

    // Render data terbaru dari cloud (sinkron otomatis jika ada perubahan stok)
    renderSearchResult(result.item);
  } catch (error) {
    console.error("Search error:", error);

    // Hanya tampilkan error jika belum ada data yang berhasil dirender dari cache
    if (!servedFromCache && !options.silent) {
      clearSearchResult();
      showSearchError(error.message || "Terjadi kesalahan saat mencari barang.");
    }
  } finally {
    if (!servedFromCache && !options.silent) {
      setSearchLoading(false);
    }
  }
}

/* =========================================
   SEARCH RESULT
========================================= */

function renderSearchResult(item) {
  hideSearchError();

  const resultBox = document.getElementById("searchResult");

  const sku = String(item.sku || "-");

  const description = String(item.description || "-");

  const totalStock = Number(item.total_stock || 0);

  const locations = Array.isArray(item.locations) ? item.locations : [];

  document.getElementById("resultSku").textContent = `SKU ${sku}`;

  document.getElementById("resultDescription").textContent = description;

  document.getElementById("resultTotalStock").textContent =
    formatNumber(totalStock);

  const userRole = String(AppState.user?.role || "").toUpperCase();
  const allowedStores = String(AppState.user?.allowed_stores || "").trim();
  const isMultiStore =
    ["SUPER_ADMIN", "SUPER ADMIN", "OPS"].includes(userRole) &&
    allowedStores === "*";

  document.getElementById("locationCount").textContent = isMultiStore
    ? `${locations.length} lokasi stock · Semua Toko`
    : `${locations.length} lokasi stock`;

  renderLocations(locations);

  resultBox.classList.remove("hidden");

  lucide.createIcons();
}

/* =========================================
   LOCATIONS
========================================= */

function renderLocations(locations) {
  const container = document.getElementById("locationList");
  container.innerHTML = "";

  if (!locations.length) {
    const empty = document.createElement("div");
    empty.className = `
      rounded-2xl
      border
      border-dashed
      border-slate-300
      bg-white
      p-6
      text-center
    `;
    empty.innerHTML = `
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <i data-lucide="package-x" class="h-6 w-6"></i>
      </div>
      <h3 class="mt-3 text-sm font-black text-slate-800">Stock kosong</h3>
      <p class="mt-1 text-xs text-slate-400">Barang belum memiliki stock pada lokasi warehouse.</p>
    `;
    container.appendChild(empty);
    lucide.createIcons();
    return;
  }

  locations.forEach((location) => {
    const card = document.createElement("div");
    card.className = `
      overflow-hidden
      rounded-2xl
      border
      border-slate-200
      bg-white
      p-4
      shadow-sm
      transition
      hover:border-slate-300
    `;

    const locationCode = escapeHtml(location.location_code || "-");
    const storeId = escapeHtml(location.store_id || AppState.user?.default_store_id || "");
    const zone = escapeHtml(location.zone || "-");
    const section = escapeHtml(location.section || "-");
    const position = escapeHtml(location.position || "-");
    const rawQty = Number(location.qty || 0);
    const qty = formatNumber(rawQty);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3 sm:gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <i data-lucide="map-pin" class="h-5 w-5 shrink-0"></i>
          </div>
          <div class="min-w-0">
            <h3 class="truncate text-base sm:text-lg font-black text-slate-900">${locationCode}</h3>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              ${storeId ? `
              <span class="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-1 text-[11px] font-bold text-indigo-700">
                <i data-lucide="store" class="h-3 w-3 shrink-0"></i>
                <span>${storeId}</span>
              </span>` : ''}
              <span class="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                Zone ${zone}
              </span>
              <span class="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                Section ${section}
              </span>
              <span class="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                ${position}
              </span>
            </div>
          </div>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-xl sm:text-2xl font-black text-slate-900">${qty}</p>
          <p class="text-xs font-medium text-slate-400">pcs</p>
        </div>
      </div>

      <!-- Tombol Aksi Cepat: Ambil & Pindah -->
      <div class="mt-4 border-t border-slate-100 pt-3">
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="btn-quick-out flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2 text-xs font-black text-red-700 transition hover:bg-red-100 active:scale-95"
            data-location="${locationCode}"
            data-qty="${rawQty}"
            data-store="${storeId}"
          >
            <i data-lucide="arrow-up-right" class="h-4 w-4 shrink-0"></i>
            <span class="truncate">Ambil</span>
          </button>
          <button
            type="button"
            class="btn-quick-move flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-95"
            data-location="${locationCode}"
            data-qty="${rawQty}"
            data-store="${storeId}"
          >
            <i data-lucide="arrow-left-right" class="h-4 w-4 shrink-0"></i>
            <span class="truncate">Pindah</span>
          </button>
        </div>
      </div>
    `;

    // Event listener tombol Ambil
    card.querySelector(".btn-quick-out").addEventListener("click", () => {
      openQuickMovementModal("OUT", locationCode, rawQty, location.store_id || storeId);
    });

    // Event listener tombol Pindah
    card.querySelector(".btn-quick-move").addEventListener("click", () => {
      openQuickMovementModal("MOVE", locationCode, rawQty, location.store_id || storeId);
    });

    container.appendChild(card);
  });

  lucide.createIcons();
}

/* =========================================
   CLEAR RESULT
========================================= */

function clearSearchResult() {
  AppState.lastSearch = null;

  document.getElementById("searchResult").classList.add("hidden");

  document.getElementById("locationList").innerHTML = "";
}

/* =========================================
   SEARCH LOADING
========================================= */

function setSearchLoading(loading) {
  AppState.searchLoading = loading;

  const button = document.getElementById("searchButton");

  const scanButton = document.getElementById("scanCameraButton");

  const input = document.getElementById("skuInput");

  button.disabled = loading;

  scanButton.disabled = loading;

  input.disabled = loading;

  if (loading) {
    button.innerHTML = `

      <div
        class="
          h-5
          w-5
          animate-spin
          rounded-full
          border-2
          border-white/40
          border-t-white
        "
      ></div>

      <span class="hidden sm:inline">
        Mencari...
      </span>

    `;
  } else {
    button.innerHTML = `

      <i
        data-lucide="search"
        class="h-5 w-5"
      ></i>

      <span class="hidden sm:inline">
        Cari
      </span>

    `;
  }

  lucide.createIcons();
}

/* =========================================
   NAVIGATION
========================================= */

function navigateTo(page) {
  const allowedPages = ["dashboard", "search", "movement", "history"];

  if (!allowedPages.includes(page)) {
    page = "dashboard";
  }

  /**
   * Matikan kamera jika user
   * meninggalkan halaman search.
   */
  if (page !== "search" && Scanner.isVisible()) {
    Scanner.close();
  }

  AppState.currentPage = page;

  const dashboardPage = document.getElementById("dashboardPage");

  const searchPage = document.getElementById("searchPage");

  const movementPage = document.getElementById("movementPage");

  const historyPage = document.getElementById("historyPage");

  dashboardPage.classList.add("hidden");

  searchPage.classList.add("hidden");

  movementPage?.classList.add("hidden");

  historyPage?.classList.add("hidden");

  if (page === "dashboard") {
    dashboardPage.classList.remove("hidden");

    setHeader("Selamat bekerja", "Dashboard");
  }

  if (page === "search") {
    searchPage.classList.remove("hidden");

    setHeader("StockFlow", "Cari Barang");
  }

  if (page === "movement") {
    movementPage?.classList.remove("hidden");

    setHeader("StockFlow", "Movement");
  }

  if (page === "history") {
    historyPage?.classList.remove("hidden");

    setHeader("StockFlow", "Riwayat");
  }

  updateNavigation();

  if (window.lucide) {
    window.lucide.createIcons();
  }

  window.scrollTo({
    top: 0,
    behavior: "instant",
  });
}

/* =========================================
   NAV STATE
========================================= */

function updateNavigation() {
  document.querySelectorAll(".desktop-nav[data-page]").forEach((button) => {
    const active = button.dataset.page === AppState.currentPage;

    button.classList.toggle("desktop-nav-active", active);
  });

  document.querySelectorAll(".mobile-nav[data-page]").forEach((button) => {
    const active = button.dataset.page === AppState.currentPage;

    button.classList.toggle("mobile-nav-active", active);
  });
}

/* =========================================
   HEADER
========================================= */

function setHeader(label, title) {
  document.getElementById("headerPageLabel").textContent = label;

  document.getElementById("headerTitle").textContent = title;
}

/* =========================================
   LOGIN LOADING
========================================= */

function setLoginLoading(loading) {
  AppState.loginLoading = loading;

  const button = document.getElementById("loginButton");

  button.disabled = loading;

  if (loading) {
    button.innerHTML = `

      <div
        class="
          h-5
          w-5
          animate-spin
          rounded-full
          border-2
          border-white/40
          border-t-white
        "
      ></div>

      <span>
        Memeriksa Access ID...
      </span>

    `;
  } else {
    button.innerHTML = `

      <span>
        Masuk
      </span>

      <i
        data-lucide="arrow-right"
        class="h-5 w-5"
      ></i>

    `;
  }

  lucide.createIcons();
}

/* =========================================
   PAGE STATE
========================================= */

function showLogin() {
  const appPage = document.getElementById("appPage");
  appPage.classList.add("hidden");
  appPage.classList.remove("lg:flex");

  const loginPage = document.getElementById("loginPage");
  loginPage.classList.remove("hidden");
  loginPage.classList.add("flex");

  if (typeof SyncTracker !== "undefined") {
    SyncTracker.reset();
  }
  if (typeof QueueManager !== "undefined") {
    QueueManager.updateBanner();
  }

  document.getElementById("bootPage").classList.add("hidden");

  lucide.createIcons();

  setTimeout(() => {
    document.getElementById("nikInput").focus();
  }, 100);
}

function showApp() {
  const loginPage = document.getElementById("loginPage");
  loginPage.classList.add("hidden");
  loginPage.classList.remove("flex");

  const appPage = document.getElementById("appPage");
  appPage.classList.remove("hidden");
  appPage.classList.add("lg:flex");

  renderUser();

  // Inisialisasi/update indikator lonceng notifikasi & antrean sesuai user aktif
  if (typeof SyncTracker !== "undefined") {
    SyncTracker.updateUI();
  }
  if (typeof QueueManager !== "undefined") {
    QueueManager.updateBanner();
  }

  document.getElementById("bootPage").classList.add("hidden");

  lucide.createIcons();
}

/* =========================================
   USER
========================================= */

function renderUser() {
  const user = AppState.user;

  if (!user) {
    return;
  }

  const displayName = user.nama || user.access_id || "Operator";

  document.getElementById("headerUserName").textContent = displayName;

  // Tampilkan access_id di header
  document.getElementById("headerUserNik").textContent = `ID ${user.access_id || "-"}`;

  document.getElementById("dashboardUserName").textContent = displayName;

  // Tampilkan access_id di dashboard
  document.getElementById("dashboardNik").textContent = `ID ${user.access_id || "-"}`;

  document.getElementById("dashboardRole").textContent = String(
    user.role || "USER",
  ).toUpperCase();

  // Tampilkan nama store (T5 sudah menambahkan elemen dashboardStore)
  const dashboardStore = document.getElementById("dashboardStore");
  if (dashboardStore) {
    dashboardStore.textContent = user.default_store_id || "-";
  }
}

/* =========================================
   LOGOUT
========================================= */

async function logout() {
  await Scanner.close();

  Auth.clearSession();

  AppState.user = null;

  AppState.currentPage = "dashboard";

  AppState.lastSearch = null;

  SearchCache.clear();

  // Bersihkan data notifikasi lonceng & antrean UI agar tidak bocor ke user berikutnya
  if (typeof SyncTracker !== "undefined") {
    SyncTracker.reset();
  }
  if (typeof QueueManager !== "undefined") {
    QueueManager.updateBanner();
  }

  document.getElementById("nikInput").value = "";

  document.getElementById("skuInput").value = "";

  clearSearchResult();

  hideSearchError();

  showLogin();

  showToast("Anda telah keluar.");
}

/* =========================================
   LOGIN ERROR
========================================= */

function showLoginError(message) {
  const errorBox = document.getElementById("loginError");

  errorBox.textContent = message;

  errorBox.classList.remove("hidden");
}

function hideLoginError() {
  const errorBox = document.getElementById("loginError");

  errorBox.textContent = "";

  errorBox.classList.add("hidden");
}

/* =========================================
   SEARCH ERROR
========================================= */

function showSearchError(message) {
  if (window.AudioFeedback) {
    window.AudioFeedback.playError();
  }

  const box = document.getElementById("searchError");

  document.getElementById("searchErrorMessage").textContent = message;

  box.classList.remove("hidden");

  lucide.createIcons();
}

function hideSearchError() {
  document.getElementById("searchError").classList.add("hidden");

  document.getElementById("searchErrorMessage").textContent = "";
}

/* =========================================
   NORMALIZE
========================================= */

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

/* =========================================
   FORMATTER
========================================= */

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return new Intl.NumberFormat("id-ID").format(number);
}

/* =========================================
   ESCAPE HTML
========================================= */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================
   TOAST
========================================= */

function showToast(message) {
  const toast = document.getElementById("toast");

  toast.textContent = message;

  toast.classList.remove("hidden");

  clearTimeout(window.__warehouseToast);

  window.__warehouseToast = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

/* =========================================
   OFFLINE QUEUE MANAGER (Option 2)
========================================= */

const QueueManager = {
  STORAGE_KEY_PREFIX: "stockflow_pending_movements",
  isProcessing: false,

  getStorageKey() {
    const accessId = AppState.user?.access_id;
    return accessId ? `${this.STORAGE_KEY_PREFIX}_${accessId}` : this.STORAGE_KEY_PREFIX;
  },

  init() {
    this.updateBanner();
    if (navigator.onLine && this.getQueue().length > 0) {
      setTimeout(() => this.processQueue(), 1200);
    }
  },

  getQueue() {
    try {
      const key = this.getStorageKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
      // Migrasi aman dari legacy key jika ada
      if (AppState.user?.access_id) {
        const legacyRaw = localStorage.getItem(this.STORAGE_KEY_PREFIX);
        if (legacyRaw) {
          const legacyQueue = JSON.parse(legacyRaw);
          if (Array.isArray(legacyQueue) && legacyQueue.length > 0) {
            const userItems = legacyQueue.filter(
              (item) => String(item.payload?.access_id || item.payload?.nik || "") === String(AppState.user.access_id)
            );
            if (userItems.length > 0) {
              localStorage.setItem(key, JSON.stringify(userItems));
              const remaining = legacyQueue.filter(
                (item) => String(item.payload?.access_id || item.payload?.nik || "") !== String(AppState.user.access_id)
              );
              localStorage.setItem(this.STORAGE_KEY_PREFIX, JSON.stringify(remaining));
              return userItems;
            }
          }
        }
      }
      return [];
    } catch {
      return [];
    }
  },

  saveQueue(queue) {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(queue));
    this.updateBanner();
    if (typeof SyncTracker !== "undefined") {
      SyncTracker.updateUI();
    }
  },

  enqueue(payload, backupState) {
    const queue = this.getQueue();
    const exists = queue.some(
      (q) =>
        q.payload.sku === payload.sku &&
        q.payload.type === payload.type &&
        q.payload.qty === payload.qty &&
        q.payload.from_location === payload.from_location &&
        q.payload.to_location === payload.to_location &&
        Date.now() - q.timestamp < 30000
    );
    if (exists) return null;

    const item = {
      id: "Q_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      payload,
      backupState,
      timestamp: Date.now(),
    };
    queue.push(item);
    this.saveQueue(queue);
    return item.id;
  },

  dequeue(id) {
    const queue = this.getQueue().filter((item) => item.id !== id);
    this.saveQueue(queue);
  },

  updateBanner() {
    const banner = document.getElementById("offlineQueueBanner");
    const countEl = document.getElementById("offlineQueueCount");
    if (!banner) return;

    // Jika tidak ada user aktif, sembunyikan banner antrean offline
    if (!AppState.user) {
      banner.classList.add("hidden");
      return;
    }

    const queue = this.getQueue();
    if (queue.length > 0) {
      if (countEl) countEl.textContent = queue.length;
      banner.classList.remove("hidden");
      if (window.lucide) lucide.createIcons();
    } else {
      banner.classList.add("hidden");
    }

    if (typeof SyncTracker !== "undefined") {
      SyncTracker.updateUI();
    }
  },

  async processQueue() {
    if (this.isProcessing || !AppState.user) return;

    const queue = this.getQueue();
    if (queue.length === 0) return;

    if (!navigator.onLine) {
      showToast("Perangkat masih offline. Menunggu koneksi internet...");
      return;
    }

    this.isProcessing = true;
    const syncBtn = document.getElementById("offlineQueueSyncBtn");
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = `
        <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"></div>
        <span>Sync...</span>
      `;
    }

    showToast(`Mengirim ${queue.length} movement tertunda...`);

    let successCount = 0;
    for (const item of [...queue]) {
      try {
        const result = await Api.post("/warehouse/movement", item.payload);
        if (result && result.success === true) {
          this.dequeue(item.id);
          if (typeof SyncTracker !== "undefined") {
            SyncTracker.markCompleted(item.id, item.payload, result.data);
          }
          successCount++;
        } else {
          this.dequeue(item.id);
          openErrorModal({
            title: "Movement Tertunda Ditolak",
            message: result?.message || "Stok di server tidak mencukupi saat disinkronkan.",
            payload: item.payload,
            canRetry: false,
          });
        }
      } catch (err) {
        console.error("Queue item sync error:", err);
        break;
      }
    }

    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `
        <i data-lucide="refresh-cw" class="h-3.5 w-3.5"></i>
        <span>Kirim</span>
      `;
      if (window.lucide) lucide.createIcons();
    }

    this.isProcessing = false;
    this.updateBanner();

    if (successCount > 0) {
      showToast(`Sukses menyinkronkan ${successCount} movement!`);
      if (AppState.lastSearch?.sku) {
        executeSearch(AppState.lastSearch.sku, { backgroundSync: true, silent: true });
      }
    }
  },
};

/* =========================================
   SYNC TRACKER & ACTIVITY CENTER
========================================= */

const SyncTracker = {
  STORAGE_RECENT_PREFIX: "stockflow_recent_synced",
  inFlightMap: new Map(),
  isModalOpen: false,

  getStorageKey() {
    const accessId = AppState.user?.access_id;
    return accessId ? `${this.STORAGE_RECENT_PREFIX}_${accessId}` : this.STORAGE_RECENT_PREFIX;
  },

  init() {
    this.bindEvents();
    this.updateUI();
    window.addEventListener("online", () => this.handleNetworkChange(true));
    window.addEventListener("offline", () => this.handleNetworkChange(false));
  },

  bindEvents() {
    const btnOpen = document.getElementById("btnOpenSyncTray");
    const banner = document.getElementById("offlineQueueBanner");
    const backdrop = document.getElementById("syncTrayBackdrop");
    const modal = document.getElementById("syncActivityModal");
    const btnClose = document.getElementById("btnCloseSyncModal");
    const btnSyncAll = document.getElementById("btnSyncAllPending");
    const btnClearRecent = document.getElementById("btnClearRecentSync");

    if (btnOpen) {
      btnOpen.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleModal();
      });
    }

    if (banner) {
      banner.addEventListener("click", (e) => {
        if (e.target.closest("#offlineQueueSyncBtn")) return;
        this.openModal();
      });
    }

    if (backdrop) {
      backdrop.addEventListener("click", (e) => {
        e.preventDefault();
        this.closeModal();
      });
    }

    if (btnClose) {
      btnClose.addEventListener("click", (e) => {
        e.preventDefault();
        this.closeModal();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isModalOpen) {
        this.closeModal();
      }
    });

    if (btnSyncAll) {
      btnSyncAll.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof QueueManager !== "undefined") {
          QueueManager.processQueue();
        }
      });
    }

    if (btnClearRecent) {
      btnClearRecent.addEventListener("click", (e) => {
        e.preventDefault();
        this.clearRecent();
      });
    }
  },

  toggleModal() {
    if (this.isModalOpen) {
      this.closeModal();
    } else {
      this.openModal();
    }
  },

  openModal() {
    const modal = document.getElementById("syncActivityModal");
    const backdrop = document.getElementById("syncTrayBackdrop");
    if (!modal) return;
    this.isModalOpen = true;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    if (backdrop) {
      backdrop.classList.remove("hidden");
    }
    this.updateUI();
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  closeModal() {
    const modal = document.getElementById("syncActivityModal");
    const backdrop = document.getElementById("syncTrayBackdrop");
    if (!modal) return;
    this.isModalOpen = false;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (backdrop) {
      backdrop.classList.add("hidden");
    }
  },

  getRecent() {
    try {
      const key = this.getStorageKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
      // Migrasi aman dari legacy key jika ada
      if (AppState.user?.access_id) {
        const legacyRaw = localStorage.getItem(this.STORAGE_RECENT_PREFIX);
        if (legacyRaw) {
          const legacyItems = JSON.parse(legacyRaw);
          if (Array.isArray(legacyItems) && legacyItems.length > 0) {
            const userItems = legacyItems.filter(
              (item) => String(item.access_id || item.payload?.access_id || item.payload?.nik || "") === String(AppState.user.access_id)
            );
            if (userItems.length > 0) {
              localStorage.setItem(key, JSON.stringify(userItems));
              return userItems;
            }
          }
        }
      }
      return [];
    } catch {
      return [];
    }
  },

  saveRecent(list) {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(list.slice(0, 15)));
  },

  addInFlight(id, payload) {
    this.inFlightMap.set(id, {
      id,
      payload,
      timestamp: Date.now(),
      status: "syncing",
      access_id: AppState.user?.access_id || payload?.access_id || ""
    });
    this.updateUI();
  },

  markCompleted(id, payload, serverData) {
    this.inFlightMap.delete(id);
    const recent = this.getRecent();
    const now = new Date();
    const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    recent.unshift({
      id: serverData?.movement_id || id,
      payload,
      timestamp: Date.now(),
      completedAt: timeStr,
      access_id: AppState.user?.access_id || payload?.access_id || ""
    });
    this.saveRecent(recent);
    this.updateUI();
  },

  markFailed(id) {
    this.inFlightMap.delete(id);
    this.updateUI();
  },

  clearRecent() {
    localStorage.removeItem(this.getStorageKey());
    this.updateUI();
  },

  reset() {
    this.inFlightMap.clear();
    this.closeModal();

    const badge = document.getElementById("syncTrayBadge");
    if (badge) {
      badge.textContent = "0";
      badge.classList.add("hidden");
      badge.classList.remove("flex");
    }

    const countBadge = document.getElementById("syncPendingCountBadge");
    if (countBadge) countBadge.textContent = "0";

    const btnSyncAll = document.getElementById("btnSyncAllPending");
    if (btnSyncAll) btnSyncAll.classList.add("hidden");

    const pendingSection = document.getElementById("syncPendingSection");
    const pendingListEl = document.getElementById("syncPendingList");
    if (pendingSection) pendingSection.classList.add("hidden");
    if (pendingListEl) pendingListEl.innerHTML = "";

    const recentSection = document.getElementById("syncRecentSection");
    const recentListEl = document.getElementById("syncRecentList");
    if (recentSection) recentSection.classList.add("hidden");
    if (recentListEl) recentListEl.innerHTML = "";

    const emptyState = document.getElementById("syncEmptyState");
    if (emptyState) emptyState.classList.remove("hidden");
  },

  handleNetworkChange(isOnline) {
    const ind = document.getElementById("syncNetworkIndicator");
    const text = document.getElementById("syncNetworkText");
    if (ind) {
      ind.className = `h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`;
    }
    if (text) {
      text.textContent = isOnline ? "Online (Terhubung)" : "Offline (Terputus)";
      text.className = isOnline ? "font-bold text-slate-600" : "font-bold text-amber-600";
    }
    this.updateUI();
  },

  updateUI() {
    if (!AppState.user) {
      this.reset();
      return;
    }

    const activeAccessId = String(AppState.user.access_id || "");
    const inFlightList = Array.from(this.inFlightMap.values()).filter(
      (item) => !item.access_id || String(item.access_id) === activeAccessId
    );
    const queueList = typeof QueueManager !== "undefined" ? QueueManager.getQueue() : [];
    const totalPending = inFlightList.length + queueList.length;
    const isOnline = navigator.onLine;

    // 1. Update Header Bell Badge
    const badge = document.getElementById("syncTrayBadge");
    if (badge) {
      if (totalPending > 0) {
        badge.textContent = totalPending;
        badge.classList.remove("hidden");
        badge.classList.add("flex");
        if (!isOnline || queueList.length > 0) {
          badge.className = "absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white shadow-sm ring-2 ring-white";
        } else {
          badge.className = "absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-black text-white shadow-sm ring-2 ring-white animate-pulse";
        }
      } else {
        badge.classList.add("hidden");
        badge.classList.remove("flex");
      }
    }

    // 2. Update Modal Pending Count & Action Button
    const countBadge = document.getElementById("syncPendingCountBadge");
    if (countBadge) countBadge.textContent = totalPending;

    const btnSyncAll = document.getElementById("btnSyncAllPending");
    if (btnSyncAll) {
      if (queueList.length > 0 && isOnline) {
        btnSyncAll.classList.remove("hidden");
      } else {
        btnSyncAll.classList.add("hidden");
      }
    }

    // 3. Render Pending List
    const pendingSection = document.getElementById("syncPendingSection");
    const pendingListEl = document.getElementById("syncPendingList");
    if (pendingSection && pendingListEl) {
      if (totalPending > 0) {
        pendingSection.classList.remove("hidden");
        let html = "";

        // In-flight items
        for (const item of inFlightList) {
          const typeName = { IN: "Masuk", OUT: "Keluar", MOVE: "Pindah" }[item.payload?.type] || item.payload?.type || "Movement";
          const route = [item.payload?.from_location, item.payload?.to_location].filter(Boolean).join(" → ") || "-";
          html += `
            <div class="flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <div class="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-blue-700"></div>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="rounded-md bg-blue-200 px-1.5 py-0.5 text-[10px] font-black text-blue-900">${typeName}</span>
                    <strong class="truncate text-xs font-black text-slate-800">SKU ${item.payload?.sku || "-"}</strong>
                  </div>
                  <p class="mt-0.5 truncate text-[11px] text-slate-500 font-medium">
                    ${item.payload?.qty || 0} pcs · ${route}
                  </p>
                </div>
              </div>
              <span class="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">
                Mengirim...
              </span>
            </div>
          `;
        }

        // Offline queued items
        for (const item of queueList) {
          const typeName = { IN: "Masuk", OUT: "Keluar", MOVE: "Pindah" }[item.payload?.type] || item.payload?.type || "Movement";
          const route = [item.payload?.from_location, item.payload?.to_location].filter(Boolean).join(" → ") || "-";
          html += `
            <div class="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <i data-lucide="cloud-off" class="h-4 w-4"></i>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-black text-amber-900">${typeName}</span>
                    <strong class="truncate text-xs font-black text-slate-800">SKU ${item.payload?.sku || "-"}</strong>
                  </div>
                  <p class="mt-0.5 truncate text-[11px] text-slate-500 font-medium">
                    ${item.payload?.qty || 0} pcs · ${route}
                  </p>
                </div>
              </div>
              <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-800">
                Antrean HP
              </span>
            </div>
          `;
        }

        pendingListEl.innerHTML = html;
      } else {
        pendingSection.classList.add("hidden");
        pendingListEl.innerHTML = "";
      }
    }

    // 4. Render Recent Items
    const rawRecent = this.getRecent();
    const recentList = rawRecent.filter(
      (item) => !item.access_id || String(item.access_id) === activeAccessId
    );
    const recentSection = document.getElementById("syncRecentSection");
    const recentListEl = document.getElementById("syncRecentList");
    if (recentSection && recentListEl) {
      if (recentList.length > 0) {
        recentSection.classList.remove("hidden");
        let recentHtml = "";
        for (const item of recentList) {
          const typeName = { IN: "Masuk", OUT: "Keluar", MOVE: "Pindah" }[item.payload?.type] || item.payload?.type || "Movement";
          const route = [item.payload?.from_location, item.payload?.to_location].filter(Boolean).join(" → ") || "-";
          recentHtml += `
            <div class="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <i data-lucide="check" class="h-4 w-4"></i>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-700">${typeName}</span>
                    <strong class="truncate text-xs font-black text-slate-800">SKU ${item.payload?.sku || "-"}</strong>
                  </div>
                  <p class="mt-0.5 truncate text-[11px] text-slate-500 font-medium">
                    ${item.payload?.qty || 0} pcs · ${route} · ID: ${item.id}
                  </p>
                </div>
              </div>
              <span class="shrink-0 text-[11px] font-bold text-slate-400">
                ${item.completedAt || ""}
              </span>
            </div>
          `;
        }
        recentListEl.innerHTML = recentHtml;
      } else {
        recentSection.classList.add("hidden");
        recentListEl.innerHTML = "";
      }
    }

    // 5. Empty State
    const emptyState = document.getElementById("syncEmptyState");
    if (emptyState) {
      if (totalPending === 0 && recentList.length === 0) {
        emptyState.classList.remove("hidden");
      } else {
        emptyState.classList.add("hidden");
      }
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  }
};

window.SyncTracker = SyncTracker;

/* =========================================
   MOVEMENT ERROR MODAL (Option 1)
========================================= */

function openErrorModal({
  title,
  message,
  payload,
  onRetry,
  canRetry = true,
  retryLabel = "Coba Lagi",
}) {
  const modal = document.getElementById("movementErrorModal");
  if (!modal) return;

  const titleEl = document.getElementById("errorModalTitle");
  const msgEl = document.getElementById("errorModalMessage");
  const detailEl = document.getElementById("errorModalDetail");
  const retryBtn = document.getElementById("errorModalRetryBtn");

  if (titleEl) titleEl.textContent = title || "Transaksi Gagal Disimpan";
  if (msgEl) msgEl.textContent = message || "Terjadi kesalahan saat menyimpan ke server.";

  if (detailEl && payload) {
    const loc = payload.from_location
      ? `${payload.from_location} → ${payload.to_location || "Keluar"}`
      : payload.to_location || "-";
    detailEl.textContent = `SKU ${payload.sku} · Qty ${payload.qty} pcs · ${loc}`;
    detailEl.classList.remove("hidden");
  } else if (detailEl) {
    detailEl.classList.add("hidden");
  }

  if (retryBtn) {
    if (canRetry && typeof onRetry === "function") {
      retryBtn.classList.remove("hidden");
      retryBtn.innerHTML = `
        <i data-lucide="refresh-cw" class="h-4 w-4"></i>
        <span>${retryLabel}</span>
      `;
      retryBtn.onclick = () => {
        closeErrorModal();
        onRetry();
      };
    } else {
      retryBtn.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";

  if (window.lucide) lucide.createIcons();
}

function closeErrorModal() {
  const modal = document.getElementById("movementErrorModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  document.body.style.overflow = "";
}

/* =========================================
   QUICK MOVEMENT MODULE (SEARCH-TO-ACTION)
========================================= */

const QuickMovementState = {
  mode: "OUT", // "OUT" | "MOVE"
  locationCode: "",
  storeId: "",
  maxQty: 0,
  loading: false,
};

/**
 * Buka Modal Quick Movement
 * @param {'OUT' | 'MOVE'} mode
 * @param {string} locationCode
 * @param {number} availableQty
 * @param {string} storeId
 */
function openQuickMovementModal(mode, locationCode, availableQty, storeId = "") {
  if (!AppState.lastSearch || !AppState.lastSearch.sku) {
    showToast("Data barang tidak valid.");
    return;
  }

  QuickMovementState.mode = mode;
  QuickMovementState.locationCode = locationCode;
  QuickMovementState.storeId = String(storeId || AppState.user?.default_store_id || "").trim().toUpperCase();
  QuickMovementState.maxQty = Number(availableQty || 0);

  const modal = document.getElementById("quickMovementModal");
  const badgeIcon = document.getElementById("qmBadgeIcon");
  const title = document.getElementById("qmModalTitle");
  const subtitle = document.getElementById("qmModalSubtitle");
  const fromLocationEl = document.getElementById("qmFromLocation");
  const availableStockEl = document.getElementById("qmAvailableStock");
  const limitNoticeEl = document.getElementById("qmQtyLimitNotice");
  const qtyInput = document.getElementById("qmQtyInput");
  const toLocationWrapper = document.getElementById("qmToLocationWrapper");
  const toLocationInput = document.getElementById("qmToLocationInput");
  const submitBtn = document.getElementById("qmSubmitBtn");

  hideQmError();

  // Setup Teks Informasi Barang & Lokasi
  const sku = AppState.lastSearch.sku;
  const description = AppState.lastSearch.description || "";
  const storeLabel = QuickMovementState.storeId ? ` · Toko: ${QuickMovementState.storeId}` : "";
  if (subtitle) subtitle.textContent = `SKU ${sku} · ${description}${storeLabel}`;
  if (fromLocationEl) fromLocationEl.textContent = locationCode;
  if (availableStockEl) availableStockEl.textContent = formatNumber(QuickMovementState.maxQty);
  if (limitNoticeEl) limitNoticeEl.textContent = `Maks. ${formatNumber(QuickMovementState.maxQty)} pcs`;

  // Setup Qty Default = 1 (atau 0 jika stok kosong)
  if (qtyInput) {
    qtyInput.value = QuickMovementState.maxQty > 0 ? "1" : "0";
    qtyInput.max = String(QuickMovementState.maxQty);
  }

  // Setup Tombol "Ambil / Pindah Semua" Label
  const btnAll = document.getElementById("qmBtnAllStock");
  if (btnAll) {
    btnAll.textContent = mode === "OUT" ? "Ambil Semua" : "Pindah Semua";
  }

  if (mode === "OUT") {
    if (title) title.textContent = "Ambil Barang (OUT)";
    if (badgeIcon) {
      badgeIcon.className =
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600";
      badgeIcon.innerHTML = `<i data-lucide="package-minus" class="h-6 w-6"></i>`;
    }

    if (toLocationWrapper) toLocationWrapper.classList.add("hidden");
    if (toLocationInput) toLocationInput.value = "";

    if (submitBtn) {
      submitBtn.className =
        "flex h-12 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 sm:px-6 text-xs font-black text-white shadow-md shadow-red-200 transition hover:bg-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 min-w-0";
      submitBtn.innerHTML = `
        <i data-lucide="check" class="h-4 w-4 shrink-0"></i>
        <span id="qmSubmitLabel" class="truncate">Konfirmasi Ambil</span>
      `;
    }
  } else {
    if (title) title.textContent = "Pindah Lokasi (MOVE)";
    if (badgeIcon) {
      badgeIcon.className =
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600";
      badgeIcon.innerHTML = `<i data-lucide="arrow-left-right" class="h-6 w-6"></i>`;
    }

    if (toLocationWrapper) toLocationWrapper.classList.remove("hidden");
    if (toLocationInput) toLocationInput.value = "";

    if (submitBtn) {
      submitBtn.className =
        "flex h-12 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 sm:px-6 text-xs font-black text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 min-w-0";
      submitBtn.innerHTML = `
        <i data-lucide="check" class="h-4 w-4 shrink-0"></i>
        <span id="qmSubmitLabel" class="truncate">Konfirmasi Pindah</span>
      `;
    }
  }

  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
  document.body.style.overflow = "hidden";

  if (window.lucide) {
    window.lucide.createIcons();
  }

  setTimeout(() => {
    if (qtyInput) {
      qtyInput.focus();
      qtyInput.select();
    }
  }, 150);
}

function closeQuickMovementModal() {
  const modal = document.getElementById("quickMovementModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  document.body.style.overflow = "";
  hideQmError();
}

function showQmError(message) {
  const alertBox = document.getElementById("qmErrorAlert");
  const messageEl = document.getElementById("qmErrorMessage");
  if (alertBox && messageEl) {
    messageEl.textContent = message;
    alertBox.classList.remove("hidden");
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
}

function hideQmError() {
  const alertBox = document.getElementById("qmErrorAlert");
  if (alertBox) {
    alertBox.classList.add("hidden");
  }
}

function setQmLoading(loading) {
  QuickMovementState.loading = loading;
  const submitBtn = document.getElementById("qmSubmitBtn");
  const cancelBtn = document.getElementById("qmCancelBtn");
  const closeBtn = document.getElementById("qmCloseBtn");

  if (submitBtn) submitBtn.disabled = loading;
  if (cancelBtn) cancelBtn.disabled = loading;
  if (closeBtn) closeBtn.disabled = loading;

  if (submitBtn) {
    if (loading) {
      submitBtn.innerHTML = `
        <div class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></div>
        <span id="qmSubmitLabel">Memproses...</span>
      `;
    } else {
      const label =
        QuickMovementState.mode === "OUT"
          ? "Konfirmasi Ambil"
          : "Konfirmasi Pindah";
      submitBtn.innerHTML = `
        <i data-lucide="check" class="h-4 w-4 shrink-0"></i>
        <span id="qmSubmitLabel" class="truncate">${label}</span>
      `;
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }
}

function bindQuickMovementEvents() {
  // Event delegation untuk tombol di dalam locationList (bekerja dinamis saat re-render)
  document.getElementById("locationList")?.addEventListener("click", (event) => {
    const btn = event.target.closest(".btn-quick-out, .btn-quick-move");
    if (!btn) return;
    event.preventDefault();
    const locationCode = btn.dataset.location;
    const rawQty = Number(btn.dataset.qty || 0);
    const mode = btn.classList.contains("btn-quick-out") ? "OUT" : "MOVE";
    openQuickMovementModal(mode, locationCode, rawQty);
  });

  // Tombol Tutup & Batal Modal
  document.getElementById("qmCloseBtn")?.addEventListener("click", closeQuickMovementModal);
  document.getElementById("qmCancelBtn")?.addEventListener("click", closeQuickMovementModal);

  // Stepper Qty (-)
  document.getElementById("qmBtnDecrement")?.addEventListener("click", () => {
    const input = document.getElementById("qmQtyInput");
    let current = parseInt(input?.value, 10) || 1;
    if (current > 1) {
      input.value = current - 1;
      hideQmError();
    }
  });

  // Stepper Qty (+)
  document.getElementById("qmBtnIncrement")?.addEventListener("click", () => {
    const input = document.getElementById("qmQtyInput");
    let current = parseInt(input?.value, 10) || 0;
    if (current < QuickMovementState.maxQty) {
      input.value = current + 1;
      hideQmError();
    } else {
      showQmError(`Maksimal ${QuickMovementState.maxQty} pcs sesuai stok di rak ini.`);
    }
  });

  // Tombol Preset (+1, +5, +10)
  document.querySelectorAll(".qm-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const addValue = parseInt(btn.dataset.qmPreset, 10) || 0;
      const input = document.getElementById("qmQtyInput");
      let current = parseInt(input?.value, 10) || 0;
      let nextValue = current + addValue;
      if (nextValue > QuickMovementState.maxQty) {
        nextValue = QuickMovementState.maxQty;
        showToast(`Disesuaikan ke stok maksimal: ${QuickMovementState.maxQty} pcs`);
      }
      if (input) input.value = nextValue;
      hideQmError();
    });
  });

  // Tombol "Ambil / Pindah Semua"
  document.getElementById("qmBtnAllStock")?.addEventListener("click", () => {
    const input = document.getElementById("qmQtyInput");
    if (input) input.value = QuickMovementState.maxQty;
    hideQmError();
  });

  // Validasi Manual pada Qty Input Change
  document.getElementById("qmQtyInput")?.addEventListener("input", (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) {
      return;
    }
    if (val > QuickMovementState.maxQty) {
      showQmError(`Qty melebihi stok yang tersedia (Maks. ${QuickMovementState.maxQty} pcs).`);
    } else {
      hideQmError();
    }
  });

  // Tombol Scan Barcode Lokasi Tujuan (Mode MOVE)
  document.getElementById("qmToScanBtn")?.addEventListener("click", async () => {
    try {
      await Scanner.open((decodedText) => {
        const toInput = document.getElementById("qmToLocationInput");
        if (toInput) {
          toInput.value = normalizeValue(decodedText).toUpperCase();
          showToast(`Lokasi tujuan terbaca: ${toInput.value}`);
        }
      });
    } catch (error) {
      console.error("Scan location error:", error);
      showQmError(error.message || "Kamera tidak dapat dibuka.");
    }
  });

  // Tombol Konfirmasi Submit
  document.getElementById("qmSubmitBtn")?.addEventListener("click", handleQuickMovementSubmit);
}

async function handleQuickMovementSubmit() {
  if (QuickMovementState.loading) {
    return;
  }

  hideQmError();

  const mode = QuickMovementState.mode;
  const fromLocation = QuickMovementState.locationCode;
  const maxQty = QuickMovementState.maxQty;
  const sku = AppState.lastSearch?.sku;
  const access_id = AppState.user?.access_id;
  const store_id = String(QuickMovementState.storeId || AppState.user?.default_store_id || "").trim().toUpperCase();

  const qtyInput = document.getElementById("qmQtyInput");
  const qty = parseInt(qtyInput.value, 10);

  const toLocationInput = document.getElementById("qmToLocationInput");
  const toLocation = normalizeValue(toLocationInput?.value || "").toUpperCase();

  // Validasi Qty
  if (isNaN(qty) || qty <= 0) {
    showQmError("Jumlah Qty harus berupa angka lebih besar dari 0.");
    qtyInput.focus();
    return;
  }

  if (qty > maxQty) {
    showQmError(`Jumlah Qty melebihi stok di rak ini (Maks. ${maxQty} pcs).`);
    qtyInput.focus();
    return;
  }

  // Validasi access_id
  if (!access_id) {
    showQmError("Sesi login user tidak valid. Silakan login kembali.");
    return;
  }

  // Validasi Khusus Mode MOVE
  if (mode === "MOVE") {
    if (!toLocation) {
      showQmError("Lokasi tujuan wajib diisi atau discan.");
      toLocationInput.focus();
      return;
    }

    if (toLocation === fromLocation) {
      showQmError("Lokasi tujuan tidak boleh sama dengan lokasi asal.");
      toLocationInput.focus();
      return;
    }
  }

  const payload = {
    type: mode, // "OUT" | "MOVE"
    sku,
    qty,
    from_location: fromLocation,
    to_location: mode === "MOVE" ? toLocation : "",
    access_id,
    store_id,
  };

  // =========================================================
  // 1. BACKUP CURRENT SEARCH STATE (for rollback on error)
  // =========================================================
  const backupSearchState = JSON.parse(JSON.stringify(AppState.lastSearch || {}));

  // =========================================================
  // 2. OPTIMISTIC UI: UPDATE LOCAL STATE IMMEDIATELY (0 ms)
  // =========================================================
  if (AppState.lastSearch && Array.isArray(AppState.lastSearch.locations)) {
    const targetStore = QuickMovementState.storeId;
    if (mode === "OUT") {
      for (const loc of AppState.lastSearch.locations) {
        if (
          loc.location_code === fromLocation &&
          (!targetStore || !loc.store_id || loc.store_id === targetStore)
        ) {
          loc.qty = Math.max(0, Number(loc.qty || 0) - qty);
        }
      }
    } else if (mode === "MOVE") {
      for (const loc of AppState.lastSearch.locations) {
        if (
          loc.location_code === fromLocation &&
          (!targetStore || !loc.store_id || loc.store_id === targetStore)
        ) {
          loc.qty = Math.max(0, Number(loc.qty || 0) - qty);
        }
      }
      let destLoc = AppState.lastSearch.locations.find(
        (l) =>
          l.location_code === toLocation &&
          (!targetStore || !l.store_id || l.store_id === targetStore)
      );
      if (destLoc) {
        destLoc.qty = Number(destLoc.qty || 0) + qty;
      } else {
        const parts = toLocation.split("-");
        AppState.lastSearch.locations.push({
          store_id: targetStore || AppState.user?.default_store_id || "",
          location_code: toLocation,
          zone: parts[0] || "-",
          section: parts[1] || "-",
          position: parts.slice(2).join("-") || "-",
          qty: qty,
        });
      }
    }

    // Filter out locations with 0 qty
    AppState.lastSearch.locations = AppState.lastSearch.locations.filter(
      (l) => Number(l.qty || 0) > 0
    );

    // Recalculate total stock
    AppState.lastSearch.total_stock = AppState.lastSearch.locations.reduce(
      (sum, l) => sum + Number(l.qty || 0),
      0
    );

    // Update in-memory SearchCache
    SearchCache.set(getSearchCacheKey(sku), { item: AppState.lastSearch, timestamp: Date.now() });

    // Render immediately! (0 ms latency)
    renderSearchResult(AppState.lastSearch);
  }

  // =========================================================
  // 3. INSTANT OPERATOR FEEDBACK (0 ms)
  // =========================================================
  if (navigator.vibrate) {
    navigator.vibrate([40]);
  }

  closeQuickMovementModal();

  if (mode === "OUT") {
    showToast(`Mengeluarkan ${qty} pcs dari ${fromLocation}... Menyinkronkan`);
  } else {
    showToast(`Memindahkan ${qty} pcs (${fromLocation} → ${toLocation})... Menyinkronkan`);
  }

  // =========================================================
  // 4. DISPATCH API IN BACKGROUND OR QUEUE OFFLINE
  // =========================================================
  const trackingId = "MOV_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4).toUpperCase();

  if (!navigator.onLine) {
    QueueManager.enqueue(payload, backupSearchState);
    showToast("Offline: Tersimpan di memori HP & akan otomatis dikirim saat online");
    return;
  }

  if (typeof SyncTracker !== "undefined") {
    SyncTracker.addInFlight(trackingId, payload);
  }

  function sendMovement() {
    return Api.post("/warehouse/movement", payload)
      .then((result) => {
        if (!result || result.success !== true) {
          throw new Error(result?.message || "Transaksi movement ditolak server.");
        }

        const serverId = result.data?.movement_id || trackingId;

        // Feedback sukses final saat data benar-benar tersinkron di cloud
        if (window.AudioFeedback) {
          window.AudioFeedback.playSuccess();
        }
        if (navigator.vibrate) {
          navigator.vibrate([60, 40, 60]);
        }

        showToast(`Sukses: Mutasi rak berhasil diperbarui di cloud! (ID: ${serverId})`);

        if (typeof SyncTracker !== "undefined") {
          SyncTracker.markCompleted(trackingId, payload, result.data);
        }
        // Background sync sukses! Sinkronkan cache secara silent
        executeSearch(sku, { backgroundSync: true, silent: true });
      })
      .catch((error) => {
        if (typeof SyncTracker !== "undefined") {
          SyncTracker.markFailed(trackingId);
        }
        console.error("Quick movement background error:", error);

        const isNetworkErr =
          !navigator.onLine ||
          error.name === "AbortError" ||
          String(error.message || "").toLowerCase().includes("terlalu lama") ||
          String(error.message || "").toLowerCase().includes("network") ||
          String(error.message || "").toLowerCase().includes("failed to fetch");

        if (isNetworkErr) {
          // Masukkan ke offline queue agar otomatis dicoba saat online
          QueueManager.enqueue(payload, backupSearchState);

          if (navigator.vibrate) {
            navigator.vibrate([150, 75, 150]);
          }

          if (window.AudioFeedback) {
            window.AudioFeedback.playError();
          }

          openErrorModal({
            title: "Koneksi Terputus (Offline)",
            message:
              "Sinyal internet tidak stabil. Data telah otomatis disimpan di memori HP Anda dan akan dikirim saat online.",
            payload,
            canRetry: true,
            retryLabel: "Coba Sekarang",
            onRetry: () => {
              showToast("Mencoba kirim ulang...");
              sendMovement();
            },
          });
        } else {
          // Business error: Stok tidak cukup atau ditolak server
          // Wajib rollback ke kondisi sebelum transaksi
          if (AppState.lastSearch && AppState.lastSearch.sku === sku) {
            AppState.lastSearch = backupSearchState;
            SearchCache.set(getSearchCacheKey(sku), { item: backupSearchState, timestamp: Date.now() });
            renderSearchResult(backupSearchState);
          }

          if (navigator.vibrate) {
            navigator.vibrate([250, 100, 250, 100, 250]);
          }

          if (window.AudioFeedback) {
            window.AudioFeedback.playError();
          }

          openErrorModal({
            title: "Transaksi Ditolak Server",
            message:
              error.message ||
              "Stok di server tidak mencukupi atau sudah berubah. Angka stok di layar telah dikembalikan ke kondisi semula.",
            payload,
            canRetry: false,
          });
        }
      });
  }

  sendMovement();
}


