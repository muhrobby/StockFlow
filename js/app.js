const AppState = {
  user: null,

  currentPage: "dashboard",

  loginLoading: false,

  searchLoading: false,

  lastSearch: null,
};

/* =========================================
   INIT
========================================= */

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  lucide.createIcons();

  Scanner.init();

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

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.page);
    });
  });

  bindQuickMovementEvents();
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

  const nik = normalizeValue(nikInput.value);

  hideLoginError();

  if (!nik) {
    showLoginError("Masukkan NIK terlebih dahulu.");

    nikInput.focus();

    return;
  }

  setLoginLoading(true);

  try {
    const result = await Auth.login(nik);

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

    showToast(`Selamat datang, ${result.user.nama || result.user.nik}`);
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

async function executeSearch(sku) {
  if (AppState.searchLoading) {
    return;
  }

  hideSearchError();

  clearSearchResult();

  setSearchLoading(true);

  try {
    const result = await Api.post("/warehouse/search", {
      sku,
    });

    if (!result || result.success !== true) {
      throw new Error(result?.message || "Barang tidak ditemukan.");
    }

    if (!result.item) {
      throw new Error("Response barang tidak valid.");
    }

    AppState.lastSearch = result.item;

    renderSearchResult(result.item);
  } catch (error) {
    console.error("Search error:", error);

    clearSearchResult();

    showSearchError(error.message || "Terjadi kesalahan saat mencari barang.");
  } finally {
    setSearchLoading(false);
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

  document.getElementById("locationCount").textContent =
    `${locations.length} lokasi stock`;

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
    const zone = escapeHtml(location.zone || "-");
    const section = escapeHtml(location.section || "-");
    const position = escapeHtml(location.position || "-");
    const rawQty = Number(location.qty || 0);
    const qty = formatNumber(rawQty);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <i data-lucide="map-pin" class="h-5 w-5"></i>
          </div>
          <div class="min-w-0">
            <h3 class="truncate text-lg font-black text-slate-900">${locationCode}</h3>
            <div class="mt-2 flex flex-wrap gap-1.5">
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
          <p class="text-2xl font-black text-slate-900">${qty}</p>
          <p class="text-xs font-medium text-slate-400">pcs</p>
        </div>
      </div>

      <!-- Tombol Aksi Cepat: Ambil & Pindah -->
      <div class="mt-4 border-t border-slate-100 pt-3">
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="btn-quick-out flex h-11 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 text-xs font-black text-red-700 transition hover:bg-red-100 active:scale-95"
            data-location="${locationCode}"
            data-qty="${rawQty}"
          >
            <i data-lucide="arrow-up-right" class="h-4 w-4"></i>
            <span>Ambil</span>
          </button>
          <button
            type="button"
            class="btn-quick-move flex h-11 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-95"
            data-location="${locationCode}"
            data-qty="${rawQty}"
          >
            <i data-lucide="arrow-left-right" class="h-4 w-4"></i>
            <span>Pindah</span>
          </button>
        </div>
      </div>
    `;

    // Event listener tombol Ambil
    card.querySelector(".btn-quick-out").addEventListener("click", () => {
      openQuickMovementModal("OUT", locationCode, rawQty);
    });

    // Event listener tombol Pindah
    card.querySelector(".btn-quick-move").addEventListener("click", () => {
      openQuickMovementModal("MOVE", locationCode, rawQty);
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
        Memeriksa NIK...
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
  document.getElementById("appPage").classList.add("hidden");

  const loginPage = document.getElementById("loginPage");

  loginPage.classList.remove("hidden");

  loginPage.classList.add("flex");

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

  document.getElementById("appPage").classList.remove("hidden");

  renderUser();

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

  const displayName = user.nama || user.nik || "PIC";

  document.getElementById("headerUserName").textContent = displayName;

  document.getElementById("headerUserNik").textContent =
    `NIK ${user.nik || "-"}`;

  document.getElementById("dashboardUserName").textContent = displayName;

  document.getElementById("dashboardNik").textContent =
    `NIK ${user.nik || "-"}`;

  document.getElementById("dashboardRole").textContent = String(
    user.role || "PIC",
  ).toUpperCase();
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
   QUICK MOVEMENT MODULE (SEARCH-TO-ACTION)
========================================= */

const QuickMovementState = {
  mode: "OUT", // "OUT" | "MOVE"
  locationCode: "",
  maxQty: 0,
  loading: false,
};

/**
 * Buka Modal Quick Movement
 * @param {'OUT' | 'MOVE'} mode
 * @param {string} locationCode
 * @param {number} availableQty
 */
function openQuickMovementModal(mode, locationCode, availableQty) {
  if (!AppState.lastSearch || !AppState.lastSearch.sku) {
    showToast("Data barang tidak valid.");
    return;
  }

  QuickMovementState.mode = mode;
  QuickMovementState.locationCode = locationCode;
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
  if (subtitle) subtitle.textContent = `SKU ${sku} · ${description}`;
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
        "flex h-12 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-xs font-black text-white shadow-md shadow-red-200 transition hover:bg-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
      submitBtn.innerHTML = `
        <i data-lucide="check" class="h-4 w-4"></i>
        <span id="qmSubmitLabel">Konfirmasi Ambil</span>
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
        "flex h-12 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-xs font-black text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
      submitBtn.innerHTML = `
        <i data-lucide="check" class="h-4 w-4"></i>
        <span id="qmSubmitLabel">Konfirmasi Pindah</span>
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
        <i data-lucide="check" class="h-4 w-4"></i>
        <span id="qmSubmitLabel">${label}</span>
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
  const nik = AppState.user?.nik;

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

  // Validasi NIK
  if (!nik) {
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
    nik,
  };

  setQmLoading(true);

  try {
    const result = await Api.post("/warehouse/movement", payload);

    if (!result || result.success !== true) {
      throw new Error(result?.message || "Transaksi movement gagal.");
    }

    // Haptic Vibrate Feedback
    if (navigator.vibrate) {
      navigator.vibrate([60, 40, 60]);
    }

    // Tutup Modal
    closeQuickMovementModal();

    // Tampilkan Toast Feedback
    if (mode === "OUT") {
      showToast(`Berhasil mengeluarkan ${qty} pcs dari ${fromLocation}`);
    } else {
      showToast(`Berhasil memindahkan ${qty} pcs (${fromLocation} → ${toLocation})`);
    }

    // AUTO-REFRESH: Panggil ulang pencarian SKU untuk menyegarkan data stok secara realtime
    await executeSearch(sku);
  } catch (error) {
    console.error("Quick movement submit error:", error);
    showQmError(error.message || "Terjadi kesalahan saat memproses movement.");
  } finally {
    setQmLoading(false);
  }
}


