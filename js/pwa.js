/**
 * StockFlow PWA Manager
 * Manages Service Worker Lifecycle, Standalone Fullscreen Detection,
 * and In-App Install Prompts ("Install StockFlow ke Layar Utama").
 */

const PwaManager = {
  deferredPrompt: null,
  isStandalone: false,
  isInstalled: false,
  isIos: false,

  init() {
    // 1. Detect Standalone / Fullscreen Display Mode
    this.isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');

    // 2. Detect iOS Device (Safari does not fire beforeinstallprompt)
    this.isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (this.isStandalone) {
      document.documentElement.classList.add('pwa-standalone');
      console.log('[PWA] Running in Standalone Fullscreen mode.');
      this.updateInstallUI(false);
      return;
    }

    // 3. Register Service Worker
    this.registerServiceWorker();

    // 4. Bind Lifecycle Events
    this.bindEvents();

    // 5. Check if iOS and not dismissed, show header install button
    if (this.isIos && !this.isStandalone) {
      this.updateInstallUI(true);
    }
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js')
          .then((registration) => {
            // Cek update Service Worker secara aktif
            registration.update().catch(() => {});

            // Auto-refresh sekali saat Service Worker baru aktif mengambil alih kontrol
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              if (!refreshing) {
                refreshing = true;
                console.log('[PWA] Cache baru aktif, memuat ulang antarmuka...');
                window.location.reload();
              }
            });

            // Listen for background updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA] Konten baru tersedia. Siap digunakan offline.');
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }
  },

  bindEvents() {
    // Capture Chrome / Edge beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      console.log('[PWA] beforeinstallprompt event captured');

      // Update UI button visibility
      this.updateInstallUI(true);

      // Auto-show popup if not dismissed in this session
      const dismissed = sessionStorage.getItem('stockflow_pwa_dismissed');
      if (!dismissed) {
        // Subtle delay for smoother entrance
        setTimeout(() => {
          this.showInstallModal();
        }, 1200);
      }
    });

    // Capture appinstalled event
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] StockFlow has been installed to Home Screen');
      this.deferredPrompt = null;
      this.isInstalled = true;
      this.hideModal();
      this.updateInstallUI(false);

      if (typeof window.showToast === 'function') {
        window.showToast('🎉 StockFlow berhasil dipasang ke Layar Utama!');
      }

      if (window.AudioFeedback && typeof window.AudioFeedback.playSuccess === 'function') {
        window.AudioFeedback.playSuccess();
      }
    });

    // DOM Buttons binding
    const btnInstall = document.getElementById('btnPwaInstall');
    if (btnInstall) {
      btnInstall.addEventListener('click', () => this.handleInstallClick());
    }

    const btnDismiss = document.getElementById('btnPwaDismiss');
    if (btnDismiss) {
      btnDismiss.addEventListener('click', () => this.dismiss());
    }

    const btnClose = document.getElementById('btnPwaClose');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.dismiss());
    }

    const btnHeaderInstall = document.getElementById('btnHeaderInstall');
    if (btnHeaderInstall) {
      btnHeaderInstall.addEventListener('click', () => this.showInstallModal());
    }

    const loginPwaBtn = document.getElementById('loginPwaBtn');
    if (loginPwaBtn) {
      loginPwaBtn.addEventListener('click', () => this.showInstallModal());
    }
  },

  updateInstallUI(canInstall) {
    const headerBtn = document.getElementById('btnHeaderInstall');
    const loginPrompt = document.getElementById('loginPwaPrompt');

    if (this.isStandalone) {
      if (headerBtn) headerBtn.classList.add('hidden');
      if (loginPrompt) loginPrompt.classList.add('hidden');
      return;
    }

    if (canInstall) {
      if (headerBtn) {
        headerBtn.classList.remove('hidden');
        headerBtn.classList.add('flex');
      }
      if (loginPrompt) {
        loginPrompt.classList.remove('hidden');
      }
    } else {
      if (headerBtn) headerBtn.classList.add('hidden');
      if (loginPrompt) loginPrompt.classList.add('hidden');
    }
  },

  showInstallModal() {
    if (this.isStandalone) return;

    const modal = document.getElementById('pwaInstallModal');
    if (!modal) return;

    const iosGuide = document.getElementById('pwaIosGuide');
    const btnInstall = document.getElementById('btnPwaInstall');

    if (this.isIos) {
      if (iosGuide) iosGuide.classList.remove('hidden');
      if (btnInstall) {
        btnInstall.innerHTML = `
          <i data-lucide="info" class="h-4 w-4 shrink-0"></i>
          <span>Panduan Safari</span>
        `;
      }
    } else {
      if (iosGuide) iosGuide.classList.add('hidden');
      if (btnInstall) {
        btnInstall.innerHTML = `
          <i data-lucide="download" class="h-4 w-4 shrink-0"></i>
          <span>Install Sekarang</span>
        `;
      }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  },

  hideModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  dismiss() {
    sessionStorage.setItem('stockflow_pwa_dismissed', '1');
    this.hideModal();
  },

  async handleInstallClick() {
    if (this.deferredPrompt) {
      // Trigger native browser install prompt
      this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      console.log('[PWA] User choice outcome:', choice.outcome);

      if (choice.outcome === 'accepted') {
        this.hideModal();
      }
      this.deferredPrompt = null;
    } else if (this.isIos) {
      // Ensure iOS instructions are visible
      const iosGuide = document.getElementById('pwaIosGuide');
      if (iosGuide) {
        iosGuide.classList.remove('hidden');
        iosGuide.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // Manual fallback for browsers where prompt cannot be triggered programmatically
      if (typeof window.showToast === 'function') {
        window.showToast('Buka menu browser (⋮) lalu pilih "Tambahkan ke Layar Utama"');
      }
      this.hideModal();
    }
  }
};

window.PwaManager = PwaManager;
