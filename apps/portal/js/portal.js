import { SharedAuth } from '../../packages/shared-auth/index.js';
import { AudioFeedback } from '../../packages/shared-core/audio.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const loginView = document.getElementById('loginView');
  const portalView = document.getElementById('portalView');
  const loginForm = document.getElementById('loginForm');
  const accessIdInput = document.getElementById('accessIdInput');
  const btnLoginSubmit = document.getElementById('btnLoginSubmit');
  const btnLoginText = document.getElementById('btnLoginText');
  const btnLoginSpinner = document.getElementById('btnLoginSpinner');
  const loginAlert = document.getElementById('loginAlert');
  const loginAlertText = document.getElementById('loginAlertText');
  const btnLogout = document.getElementById('btnLogout');
  const btnToggleAudio = document.getElementById('btnToggleAudio');
  const audioIcon = document.getElementById('audioIcon');

  // Profile DOM Elements
  const userNameText = document.getElementById('userNameText');
  const userAccessIdText = document.getElementById('userAccessIdText');
  const userRoleBadge = document.getElementById('userRoleBadge');
  const userStoreText = document.getElementById('userStoreText');
  const storeSwitcherContainer = document.getElementById('storeSwitcherContainer');
  const activeStoreInput = document.getElementById('activeStoreInput');
  const btnUpdateStore = document.getElementById('btnUpdateStore');

  // App Cards
  const appCardStockflow = document.getElementById('appCardStockflow');
  const appCardPacking = document.getElementById('appCardPacking');

  /**
   * Render UI berdasarkan status sesi pengguna
   */
  function renderState() {
    const session = SharedAuth.getSession();

    if (window.lucide) {
      lucide.createIcons();
    }

    if (!session || !session.user) {
      // Tampilkan Form Login
      loginView.classList.remove('hidden');
      portalView.classList.add('hidden');
      btnLogout.classList.add('hidden');
      accessIdInput.value = '';
      accessIdInput.focus();
      return;
    }

    // Tampilkan Portal Launcher
    const user = session.user;
    const activeStore = SharedAuth.getActiveStore() || user.default_store_id || 'STR-001';

    loginView.classList.add('hidden');
    portalView.classList.remove('hidden');
    btnLogout.classList.remove('hidden');

    userNameText.textContent = user.nama || `Petugas ${user.access_id}`;
    userAccessIdText.textContent = user.access_id;
    userRoleBadge.textContent = user.role;
    userStoreText.textContent = `Toko: ${activeStore}`;

    // Role switcher visibility
    if (user.role === 'SUPER_ADMIN' || user.role === 'OPS') {
      storeSwitcherContainer.classList.remove('hidden');
      activeStoreInput.value = activeStore;
    } else {
      storeSwitcherContainer.classList.add('hidden');
    }

    // Filter Module Access Matrix
    if (SharedAuth.canAccessApp('stockflow')) {
      appCardStockflow.classList.remove('opacity-40', 'pointer-events-none');
    } else {
      appCardStockflow.classList.add('opacity-40', 'pointer-events-none');
    }

    if (SharedAuth.canAccessApp('packing')) {
      appCardPacking.classList.remove('opacity-40', 'pointer-events-none');
    } else {
      appCardPacking.classList.add('opacity-40', 'pointer-events-none');
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /**
   * Handle Submit Login
   */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const accessId = accessIdInput.value.trim();
    if (!accessId) return;

    // Set Loading UI
    btnLoginSubmit.disabled = true;
    btnLoginText.textContent = 'Memeriksa...';
    btnLoginSpinner.classList.remove('hidden');
    loginAlert.classList.add('hidden');

    try {
      await SharedAuth.login(accessId);
      await AudioFeedback.playSuccess();
      renderState();
    } catch (err) {
      await AudioFeedback.playError();
      loginAlertText.textContent = err.message || 'Access ID tidak ditemukan.';
      loginAlert.classList.remove('hidden');
      accessIdInput.focus();
    } finally {
      btnLoginSubmit.disabled = false;
      btnLoginText.textContent = 'Masuk';
      btnLoginSpinner.classList.add('hidden');
    }
  });

  /**
   * Handle Logout
   */
  btnLogout.addEventListener('click', () => {
    SharedAuth.clearSession();
    renderState();
  });

  /**
   * Handle Store Switcher Update
   */
  btnUpdateStore.addEventListener('click', () => {
    const newStore = activeStoreInput.value.trim().toUpperCase();
    if (!newStore) return;
    SharedAuth.setActiveStore(newStore);
    AudioFeedback.playSuccess();
    renderState();
  });

  /**
   * Handle Audio Toggle
   */
  btnToggleAudio.addEventListener('click', async () => {
    const active = await AudioFeedback.toggleAudio();
    if (active) {
      btnToggleAudio.classList.remove('text-slate-400');
      btnToggleAudio.classList.add('text-slate-600');
      audioIcon.setAttribute('data-lucide', 'volume-2');
    } else {
      btnToggleAudio.classList.remove('text-slate-600');
      btnToggleAudio.classList.add('text-slate-400');
      audioIcon.setAttribute('data-lucide', 'volume-x');
    }
    if (window.lucide) {
      lucide.createIcons();
    }
  });

  // Render awal saat dokumen siap
  renderState();
});
