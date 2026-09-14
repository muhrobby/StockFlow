(function () {

  /**
   * Login melalui n8n.
   */
  async function login(
    access_id
  ) {

    return Api.post(
      '/warehouse/login',
      {
        access_id
      }
    );

  }


  /**
   * Simpan session frontend.
   *
   * Untuk tahap login sekarang,
   * ini hanya session UI.
   *
   * Backend authentication yang lebih
   * kuat akan kita tambahkan sebelum
   * operasi IN / OUT / MOVE production.
   */
  function normalizeUser(user) {
    if (!user || typeof user !== 'object') return user;
    return {
      ...user,
      role: String(user.role || 'USER').trim().toUpperCase(),
      default_store_id: String(user.default_store_id || '').trim().toUpperCase(),
      allowed_stores: String(user.allowed_stores || '').trim().toUpperCase()
    };
  }

  function saveSession(
    user,
    token = ''
  ) {

    const sessionToken =
      token ||
      user?.session_token ||
      user?.token ||
      '';

    const normalized = normalizeUser(user);

    const session = {

      user: normalized,

      token: sessionToken,

      created_at:
        Date.now(),

      expires_at:
        Date.now() +
        APP_CONFIG.SESSION_TTL_MS

    };


    localStorage.setItem(
      APP_CONFIG.SESSION_KEY,
      JSON.stringify(session)
    );

    if (normalized?.default_store_id) {
      setActiveStore(normalized.default_store_id);
    }


    return session;

  }


  /**
   * Ambil session.
   */
  function getSession() {

    const raw =
      localStorage.getItem(
        APP_CONFIG.SESSION_KEY
      );


    if (!raw) {
      return null;
    }


    try {

      const session =
        JSON.parse(raw);


      if (
        !session.user ||
        !session.expires_at
      ) {

        clearSession();

        return null;

      }


      if (
        Date.now() >
        Number(session.expires_at)
      ) {

        clearSession();

        return null;

      }

      session.user = normalizeUser(session.user);

      return session;


    } catch {

      clearSession();

      return null;

    }

  }


  /**
   * Ambil token sesi aktif.
   */
  function getToken() {
    const session = getSession();
    return session?.token || '';
  }

  /**
   * Ambil toko aktif (sinkron dengan portal).
   */
  function getActiveStore() {
    try {
      const saved = localStorage.getItem('active_store');
      if (saved) return saved.trim().toUpperCase();
    } catch (_) {}

    const session = getSession();
    return session?.user?.default_store_id || '';
  }

  /**
   * Set toko aktif.
   */
  function setActiveStore(storeId) {
    const clean = String(storeId || '').trim().toUpperCase();
    try {
      localStorage.setItem('active_store', clean);
    } catch (_) {}
    return clean;
  }

  /**
   * Logout.
   */
  function clearSession() {

    localStorage.removeItem(
      APP_CONFIG.SESSION_KEY
    );

  }


  window.Auth = {
    login,
    saveSession,
    getSession,
    getToken,
    getActiveStore,
    setActiveStore,
    clearSession
  };

})();
