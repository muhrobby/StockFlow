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
  function saveSession(
    user
  ) {

    const session = {

      user,

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


      return session;


    } catch {

      clearSession();

      return null;

    }

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
    clearSession
  };

})();
