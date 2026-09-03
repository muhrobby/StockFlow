(function () {
  let scanner = null;

  let isStarting = false;

  let isScanning = false;

  let resultLocked = false;

  let successCallback = null;

  /* =========================================
     ELEMENT
  ========================================= */

  function getModal() {
    return document.getElementById("scannerModal");
  }

  function getReader() {
    return document.getElementById("cameraReader");
  }

  function getStatus() {
    return document.getElementById("scannerStatus");
  }

  /* =========================================
     INIT
  ========================================= */

  function init() {
    const closeButton = document.getElementById("scannerCloseButton");

    if (closeButton) {
      closeButton.addEventListener("click", close);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isVisible()) {
        close();
      }
    });
  }

  async function loadScannerLibrary() {
    if (typeof Html5Qrcode !== "undefined") {
      return;
    }

    if (window.__html5QrcodeLoading) {
      await window.__html5QrcodeLoading;
      return;
    }

    window.__html5QrcodeLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

      script.async = true;

      script.onload = () => {
        if (typeof Html5Qrcode === "undefined") {
          reject(new Error("Library scanner tidak tersedia."));

          return;
        }

        resolve();
      };

      script.onerror = () => {
        reject(
          new Error("Library scanner gagal dimuat. Periksa koneksi internet."),
        );
      };

      document.head.appendChild(script);
    });

    try {
      await window.__html5QrcodeLoading;
    } catch (error) {
      window.__html5QrcodeLoading = null;

      throw error;
    }
  }

  /* =========================================
     OPEN
  ========================================= */

  async function open(onSuccess) {
    if (isStarting || isScanning) {
      return;
    }

    await loadScannerLibrary();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Browser tidak mendukung akses kamera.");
    }

    successCallback = typeof onSuccess === "function" ? onSuccess : null;

    resultLocked = false;

    showModal();

    setStatus("Menyiapkan kamera...");

    isStarting = true;

    scanner = new Html5Qrcode("cameraReader");

    const qrboxWidth = Math.max(220, Math.min(320, window.innerWidth - 64));

    const qrboxHeight = Math.round(qrboxWidth * 0.45);

    const config = {
      fps: 15,

      qrbox: {
        width: qrboxWidth,

        height: qrboxHeight,
      },

      aspectRatio: 1.7777778,

      disableFlip: false,
    };

    try {
      /**
       * Prioritaskan kamera belakang.
       */
      try {
        await scanner.start(
          {
            facingMode: {
              exact: "environment",
            },
          },

          config,

          handleSuccess,

          handleScanFailure,
        );
      } catch (environmentExactError) {
        /**
         * Beberapa HP/browser tidak menerima
         * constraint "exact".
         */
        await scanner.start(
          {
            facingMode: "environment",
          },

          config,

          handleSuccess,

          handleScanFailure,
        );
      }

      isScanning = true;

      setStatus("Arahkan kamera ke barcode");
    } catch (error) {
      console.error("Camera start error:", error);

      await cleanup();

      hideModal();

      throw new Error(getCameraErrorMessage(error));
    } finally {
      isStarting = false;
    }
  }

  /* =========================================
     SUCCESS
  ========================================= */

  async function handleSuccess(decodedText) {
    if (resultLocked) {
      return;
    }

    const result = String(decodedText || "").trim();

    if (!result) {
      return;
    }

    resultLocked = true;

    setStatus("Barcode terbaca");

    if (navigator.vibrate) {
      navigator.vibrate(120);
    }

    // Mainkan suara beep renyah scanner fisik
    if (window.AudioFeedback) {
      window.AudioFeedback.playSuccess();
    }

    const callback = successCallback;

    await close();

    if (callback) {
      try {
        await callback(result);
      } catch (error) {
        console.error("Scanner callback error:", error);
      }
    }
  }

  /* =========================================
     SCAN FAILURE
  ========================================= */

  function handleScanFailure() {
    /**
     * Tidak perlu melakukan apa-apa.
     *
     * Callback ini dipanggil sangat sering
     * ketika frame kamera belum menemukan
     * barcode.
     */
  }

  /* =========================================
     CLOSE
  ========================================= */

  async function close() {
    resultLocked = true;

    await cleanup();

    hideModal();
  }

  /* =========================================
     CLEANUP
  ========================================= */

  async function cleanup() {
    if (!scanner) {
      isScanning = false;

      isStarting = false;

      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch (error) {
      console.warn("Scanner stop warning:", error);
    }

    try {
      scanner.clear();
    } catch (error) {
      console.warn("Scanner clear warning:", error);
    }

    scanner = null;

    isScanning = false;

    isStarting = false;

    const reader = getReader();

    if (reader) {
      reader.innerHTML = "";
    }
  }

  /* =========================================
     MODAL
  ========================================= */

  function showModal() {
    const modal = getModal();

    modal.classList.remove("hidden");

    document.body.style.overflow = "hidden";

    lucide.createIcons();
  }

  function hideModal() {
    const modal = getModal();

    modal.classList.add("hidden");

    document.body.style.overflow = "";
  }

  function isVisible() {
    const modal = getModal();

    return modal && !modal.classList.contains("hidden");
  }

  /* =========================================
     STATUS
  ========================================= */

  function setStatus(message) {
    const status = getStatus();

    if (status) {
      status.textContent = message;
    }
  }

  /* =========================================
     CAMERA ERROR
  ========================================= */

  function getCameraErrorMessage(error) {
    const message = String(error?.message || error || "").toLowerCase();

    if (message.includes("permission") || message.includes("notallowed")) {
      return (
        "Izin kamera ditolak. " +
        "Izinkan akses kamera pada browser lalu coba lagi."
      );
    }

    if (message.includes("notfound") || message.includes("camera not found")) {
      return "Kamera tidak ditemukan pada perangkat.";
    }

    if (
      message.includes("notreadable") ||
      message.includes("could not start")
    ) {
      return (
        "Kamera sedang digunakan aplikasi lain. " +
        "Tutup aplikasi kamera lain lalu coba kembali."
      );
    }

    return "Kamera tidak dapat dibuka. " + "Periksa izin kamera pada browser.";
  }

  /* =========================================
     EXPORT
  ========================================= */

  window.Scanner = {
    init,

    open,

    close,

    isVisible,
  };
})();
