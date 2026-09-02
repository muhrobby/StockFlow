(function () {

  async function request(
    path,
    options = {}
  ) {

    const controller =
      new AbortController();


    const timeoutId =
      setTimeout(
        () => controller.abort(),
        APP_CONFIG.REQUEST_TIMEOUT_MS
      );


    try {

      const response =
        await fetch(
          `${APP_CONFIG.API_BASE_URL}${path}`,
          {
            ...options,

            headers: {
              'Content-Type':
                'application/json',

              ...(options.headers || {})
            },

            signal:
              controller.signal
          }
        );


      const rawText =
        await response.text();


      let data = {};


      if (rawText) {

        try {

          data =
            JSON.parse(rawText);

        } catch {

          throw new Error(
            'Response API bukan JSON yang valid.'
          );

        }

      }


      if (!response.ok) {

        throw new Error(
          data?.message ||
          `HTTP ${response.status}`
        );

      }


      return data;


    } catch (error) {

      if (
        error.name ===
        'AbortError'
      ) {

        throw new Error(
          'Server terlalu lama merespons.'
        );

      }


      throw error;


    } finally {

      clearTimeout(
        timeoutId
      );

    }

  }


  async function post(
    path,
    body
  ) {

    return request(
      path,
      {
        method: 'POST',

        body:
          JSON.stringify(body)
      }
    );

  }


  window.Api = {
    request,
    post
  };

})();
