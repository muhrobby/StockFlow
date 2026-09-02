window.APP_CONFIG = Object.freeze({

  APP_NAME: 'Warehouse App',

  API_BASE_URL:
    'https://n8n-v2.humalab.my.id/webhook',

  SESSION_KEY:
    'warehouse_session',

  SESSION_TTL_MS:
    8 * 60 * 60 * 1000,

  REQUEST_TIMEOUT_MS:
    15000,

  BULK_REQUEST_TIMEOUT_MS:
    60000

});
