(function () {

  async function request(
    path,
    options = {}
  ) {

    const timeoutMs =
      options.timeoutMs ||
      APP_CONFIG.REQUEST_TIMEOUT_MS;

    const controller =
      new AbortController();


    const timeoutId =
      setTimeout(
        () => controller.abort(),
        timeoutMs
      );


    try {

      const token = window.Auth?.getToken?.() || '';
      const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {};

      const response =
        await fetch(
          `${APP_CONFIG.API_BASE_URL}${path}`,
          {
            ...options,

            headers: {
              'Content-Type':
                'application/json',

              ...authHeader,

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

        if (response.status === 401) {
          window.Auth?.clearSession?.();
          if (typeof window.showToast === 'function') {
            window.showToast('Sesi login Anda telah berakhir. Mengalihkan ke Portal Utama...', 'error');
          }
          setTimeout(() => {
            window.location.replace('/');
          }, 1200);
          throw new Error(data?.message || 'Sesi Anda telah berakhir (HTTP 401). Silakan login kembali melalui Portal Utama.');
        }

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
    body,
    options = {}
  ) {

    return request(
      path,
      {
        method: 'POST',

        body:
          JSON.stringify(body),

        ...options
      }
    );

  }


  async function getLocations(storeId) {
    return post('/warehouse/locations', { store_id: storeId });
  }

  async function submitBatchLocationEntry(payload) {
    try {
      const res = await post('/warehouse/batch-location-entry', payload, {
        timeoutMs: APP_CONFIG.BULK_REQUEST_TIMEOUT_MS || 30000
      });
      if (res && res.success) {
        return res;
      }
      throw new Error(res?.message || 'Gagal eksekusi batch location entry');
    } catch (err) {
      console.warn('Endpoint batch-location-entry belum aktif/gagal di n8n. Mengalihkan ke bulk-upload:', err.message);
      // Fallback handal ke endpoint /warehouse/bulk-upload yang sudah live di n8n
      const bulkPayload = {
        access_id: payload.access_id,
        store_id: payload.store_id,
        mode: payload.mode || 'SET',
        items: (payload.items || []).map(function (it) {
          return {
            sku: it.sku,
            location: payload.location_code,
            qty: it.qty
          };
        })
      };
      return post('/warehouse/bulk-upload', bulkPayload, {
        timeoutMs: APP_CONFIG.BULK_REQUEST_TIMEOUT_MS || 45000
      });
    }
  }

  window.Api = {
    request,
    post,
    getLocations,
    submitBatchLocationEntry
  };

})();
