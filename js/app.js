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

      <div
        class="
          mx-auto
          flex
          h-12
          w-12
          items-center
          justify-center
          rounded-2xl
          bg-slate-100
          text-slate-400
        "
      >
        <i
          data-lucide="package-x"
          class="h-6 w-6"
        ></i>
      </div>

      <h3
        class="
          mt-3
          text-sm
          font-black
        "
      >
        Stock kosong
      </h3>

      <p
        class="
          mt-1
          text-xs
          text-slate-400
        "
      >
        Barang belum memiliki stock pada lokasi warehouse.
      </p>

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
      `;

    const locationCode = escapeHtml(location.location_code || "-");

    const zone = escapeHtml(location.zone || "-");

    const section = escapeHtml(location.section || "-");

    const position = escapeHtml(location.position || "-");

    const qty = formatNumber(Number(location.qty || 0));

    card.innerHTML = `

        <div
          class="
            flex
            items-start
            justify-between
            gap-4
          "
        >

          <div
            class="
              flex
              min-w-0
              gap-3
            "
          >

            <div
              class="
                flex
                h-11
                w-11
                shrink-0
                items-center
                justify-center
                rounded-xl
                bg-red-50
                text-red-600
              "
            >
              <i
                data-lucide="map-pin"
                class="h-5 w-5"
              ></i>
            </div>


            <div class="min-w-0">

              <h3
                class="
                  truncate
                  text-lg
                  font-black
                "
              >
                ${locationCode}
              </h3>


              <div
                class="
                  mt-2
                  flex
                  flex-wrap
                  gap-1.5
                "
              >

                <span
                  class="
                    rounded-lg
                    bg-slate-100
                    px-2
                    py-1
                    text-[11px]
                    font-bold
                    text-slate-600
                  "
                >
                  Zone ${zone}
                </span>


                <span
                  class="
                    rounded-lg
                    bg-slate-100
                    px-2
                    py-1
                    text-[11px]
                    font-bold
                    text-slate-600
                  "
                >
                  Section ${section}
                </span>


                <span
                  class="
                    rounded-lg
                    bg-slate-100
                    px-2
                    py-1
                    text-[11px]
                    font-bold
                    text-slate-600
                  "
                >
                  ${position}
                </span>

              </div>

            </div>

          </div>


          <div
            class="
              shrink-0
              text-right
            "
          >

            <p
              class="
                text-2xl
                font-black
                text-slate-900
              "
            >
              ${qty}
            </p>

            <p
              class="
                text-xs
                font-medium
                text-slate-400
              "
            >
              pcs
            </p>

          </div>

        </div>

      `;

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
