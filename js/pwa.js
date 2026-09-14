/**
 * StockFlow Service Worker & Cache Cleanup
 * Secara aktif mencabut seluruh pendaftaran Service Worker dan
 * membersihkan CacheStorage yang tersimpan pada browser/ponsel operator.
 */
(function () {
  'use strict';

  // 1. Unregister seluruh Service Worker yang aktif pada scope StockFlow
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      if (Array.isArray(registrations) && registrations.length > 0) {
        registrations.forEach(function (registration) {
          registration.unregister().then(function (success) {
            if (success) {
              console.log('[StockFlow PWA Cleanup] Service Worker berhasil dicabut:', registration.scope);
            }
          }).catch(function (err) {
            console.warn('[StockFlow PWA Cleanup] Gagal unregister SW:', err);
          });
        });
      }
    }).catch(function (err) {
      console.warn('[StockFlow PWA Cleanup] getRegistrations error:', err);
    });
  }

  // 2. Bersihkan seluruh data CacheStorage yang pernah dibuat
  if ('caches' in window) {
    caches.keys().then(function (cacheNames) {
      if (Array.isArray(cacheNames) && cacheNames.length > 0) {
        cacheNames.forEach(function (name) {
          caches.delete(name).then(function () {
            console.log('[StockFlow PWA Cleanup] CacheStorage dibersihkan:', name);
          }).catch(function (err) {
            console.warn('[StockFlow PWA Cleanup] Gagal menghapus cache:', name, err);
          });
        });
      }
    }).catch(function (err) {
      console.warn('[StockFlow PWA Cleanup] caches.keys error:', err);
    });
  }

  // Dummy PwaManager object agar pemanggilan lawas tidak memicu ReferenceError
  window.PwaManager = {
    init: function () {},
    showInstallModal: function () {},
    hideModal: function () {},
    dismiss: function () {}
  };
})();
