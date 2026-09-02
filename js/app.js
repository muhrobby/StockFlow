const AppState = {

  user: null,

  loginLoading: false

};


/* =========================================
   INIT
========================================= */

document.addEventListener(
  'DOMContentLoaded',
  initApp
);


function initApp() {

  lucide.createIcons();

  bindEvents();

  bootstrap();

}


/* =========================================
   EVENTS
========================================= */

function bindEvents() {

  document
    .getElementById(
      'loginForm'
    )
    .addEventListener(
      'submit',
      handleLogin
    );


  document
    .getElementById(
      'desktopLogoutButton'
    )
    .addEventListener(
      'click',
      logout
    );


  document
    .getElementById(
      'mobileLogoutButton'
    )
    .addEventListener(
      'click',
      logout
    );

}


/* =========================================
   BOOTSTRAP
========================================= */

function bootstrap() {

  const session =
    Auth.getSession();


  if (
    session &&
    session.user
  ) {

    AppState.user =
      session.user;


    showApp();

    return;

  }


  showLogin();

}


/* =========================================
   LOGIN
========================================= */

async function handleLogin(
  event
) {

  event.preventDefault();


  if (
    AppState.loginLoading
  ) {
    return;
  }


  const nikInput =
    document.getElementById(
      'nikInput'
    );


  const errorBox =
    document.getElementById(
      'loginError'
    );


  const nik =
    String(
      nikInput.value || ''
    )
      .trim()
      .replace(/\s+/g, '');


  hideLoginError();


  if (!nik) {

    showLoginError(
      'Masukkan NIK terlebih dahulu.'
    );


    nikInput.focus();

    return;

  }


  setLoginLoading(
    true
  );


  try {

    const result =
      await Auth.login(
        nik
      );


    if (
      !result ||
      result.success !== true
    ) {

      throw new Error(
        result?.message ||
        'Login gagal.'
      );

    }


    if (
      !result.user
    ) {

      throw new Error(
        'Data user tidak ditemukan pada response.'
      );

    }


    Auth.saveSession(
      result.user
    );


    AppState.user =
      result.user;


    showApp();


    showToast(
      `Selamat datang, ${
        result.user.nama ||
        result.user.nik
      }`
    );


  } catch (error) {

    console.error(
      'Login error:',
      error
    );


    showLoginError(
      error.message ||
      'Terjadi kesalahan saat login.'
    );


    nikInput.focus();


  } finally {

    setLoginLoading(
      false
    );

  }

}


/* =========================================
   LOGIN BUTTON
========================================= */

function setLoginLoading(
  loading
) {

  AppState.loginLoading =
    loading;


  const button =
    document.getElementById(
      'loginButton'
    );


  button.disabled =
    loading;


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

  const bootPage =
    document.getElementById(
      'bootPage'
    );


  const loginPage =
    document.getElementById(
      'loginPage'
    );


  const appPage =
    document.getElementById(
      'appPage'
    );


  appPage.classList.add(
    'hidden'
  );


  loginPage.classList.remove(
    'hidden'
  );


  loginPage.classList.add(
    'flex'
  );


  bootPage.classList.add(
    'hidden'
  );


  lucide.createIcons();


  setTimeout(
    () => {

      document
        .getElementById(
          'nikInput'
        )
        .focus();

    },
    100
  );

}


function showApp() {

  const bootPage =
    document.getElementById(
      'bootPage'
    );


  const loginPage =
    document.getElementById(
      'loginPage'
    );


  const appPage =
    document.getElementById(
      'appPage'
    );


  loginPage.classList.add(
    'hidden'
  );


  loginPage.classList.remove(
    'flex'
  );


  appPage.classList.remove(
    'hidden'
  );


  renderUser();


  bootPage.classList.add(
    'hidden'
  );


  lucide.createIcons();

}


/* =========================================
   USER
========================================= */

function renderUser() {

  const user =
    AppState.user;


  if (!user) {
    return;
  }


  const displayName =
    user.nama ||
    user.nik ||
    'PIC';


  document
    .getElementById(
      'headerUserName'
    )
    .textContent =
      displayName;


  document
    .getElementById(
      'dashboardUserName'
    )
    .textContent =
      displayName;


  document
    .getElementById(
      'dashboardNik'
    )
    .textContent =
      `NIK ${user.nik || '-'}`;


  document
    .getElementById(
      'dashboardRole'
    )
    .textContent =
      String(
        user.role ||
        'PIC'
      ).toUpperCase();

}


/* =========================================
   LOGOUT
========================================= */

function logout() {

  Auth.clearSession();


  AppState.user =
    null;


  document
    .getElementById(
      'nikInput'
    )
    .value =
      '';


  showLogin();


  showToast(
    'Anda telah keluar.'
  );

}


/* =========================================
   LOGIN ERROR
========================================= */

function showLoginError(
  message
) {

  const errorBox =
    document.getElementById(
      'loginError'
    );


  errorBox.textContent =
    message;


  errorBox.classList.remove(
    'hidden'
  );

}


function hideLoginError() {

  const errorBox =
    document.getElementById(
      'loginError'
    );


  errorBox.textContent =
    '';


  errorBox.classList.add(
    'hidden'
  );

}


/* =========================================
   TOAST
========================================= */

function showToast(
  message
) {

  const toast =
    document.getElementById(
      'toast'
    );


  toast.textContent =
    message;


  toast.classList.remove(
    'hidden'
  );


  clearTimeout(
    window.__warehouseToast
  );


  window.__warehouseToast =
    setTimeout(
      () => {

        toast.classList.add(
          'hidden'
        );

      },
      2500
    );

}
