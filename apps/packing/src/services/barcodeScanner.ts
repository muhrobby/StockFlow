declare global {
  interface Window {
    Html5Qrcode: any;
    __html5QrcodeLoading?: Promise<void> | null;
  }
}

export async function loadHtml5Qrcode(): Promise<any> {
  if (typeof window.Html5Qrcode !== 'undefined') {
    return window.Html5Qrcode;
  }

  if (window.__html5QrcodeLoading) {
    await window.__html5QrcodeLoading;
    return window.Html5Qrcode;
  }

  window.__html5QrcodeLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.async = true;

    script.onload = () => {
      if (typeof window.Html5Qrcode === 'undefined') {
        reject(new Error('Library scanner tidak tersedia setelah dimuat.'));
        return;
      }
      resolve();
    };

    script.onerror = () => {
      reject(new Error('Gagal memuat library scanner barcode. Periksa koneksi internet.'));
    };

    document.head.appendChild(script);
  });

  try {
    await window.__html5QrcodeLoading;
    return window.Html5Qrcode;
  } catch (err) {
    window.__html5QrcodeLoading = null;
    throw err;
  }
}
