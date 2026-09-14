/**
 * watermark.ts
 * High-Performance Client-Side Canvas Watermarking Engine.
 * 
 * Fitur:
 * 1. Zero Network Latency: Stempel dibubuhkan instan (<15 ms) langsung di canvas HP.
 * 2. Zero Token Needed: Tanpa perlu Bearer token atau API eksternal, 100% aman dari kebocoran.
 * 3. High Legibility: Dilengkapi background gradient gelap dan drop-shadow sehingga
 *    tulisan selalu terbaca jelas di atas paket warna putih, kardus cokelat, maupun plastik hitam.
 * 4. Responsive Typography: Ukuran font dan padding diskalakan proporsional sesuai resolusi gambar.
 */

export interface WatermarkOptions {
  address: string;
  timestamp: string;
  accessId?: string;
  invNo?: string;
}

/**
 * Membubuhkan stempel resmi alamat dan timestamp langsung di atas Canvas foto.
 */
export function applyCanvasWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: WatermarkOptions
): void {
  const paddingX = Math.max(16, Math.round(width * 0.02));
  const paddingY = Math.max(12, Math.round(height * 0.015));

  // Skala ukuran font sesuai lebar gambar
  const fontSizePrimary = Math.max(16, Math.min(32, Math.round(width * 0.022)));
  const fontSizeSecondary = Math.max(13, Math.min(24, Math.round(width * 0.017)));
  
  const lineSpacing = Math.round(fontSizePrimary * 0.35);
  const bannerHeight = fontSizePrimary + fontSizeSecondary + lineSpacing + paddingY * 2.2;

  ctx.save();

  // 1. GRADIENT BACKDROP STRIP DI BAGIAN BAWAH
  const gradient = ctx.createLinearGradient(0, height - bannerHeight - 16, 0, height);
  gradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
  gradient.addColorStop(0.25, 'rgba(15, 23, 42, 0.78)');
  gradient.addColorStop(1, 'rgba(15, 23, 42, 0.94)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, height - bannerHeight - 16, width, bannerHeight + 16);

  // 2. GARIS AKSEN MERAH KHAS STOCKFLOW (3px)
  ctx.fillStyle = '#dc2626'; // red-600
  ctx.fillRect(0, height - bannerHeight - 16, width, Math.max(3, Math.round(height * 0.004)));

  // 3. TEKS ALAMAT TOKO RESMI (BARIS 1)
  ctx.font = `bold ${fontSizePrimary}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  const rawAddress = (options.address || 'Gudang Operasional StockFlow').trim();
  const addressText = `📍 ${rawAddress}`;
  
  // Posisi vertikal baris 1
  const line1Y = height - bannerHeight + paddingY + fontSizePrimary * 0.85;
  ctx.fillText(addressText, paddingX, line1Y);

  // 4. TEKS WAKTU & METADATA OPERATOR (BARIS 2)
  ctx.font = `500 ${fontSizeSecondary}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#cbd5e1'; // slate-300
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 3;

  const timePart = `🕒 ${options.timestamp}`;
  const picPart = options.accessId ? ` • PIC: ${options.accessId}` : '';
  const invPart = options.invNo ? ` • INV: ${options.invNo}` : '';
  const metaText = `${timePart}${picPart}${invPart}`;

  // Posisi vertikal baris 2
  const line2Y = line1Y + fontSizeSecondary + lineSpacing + 2;
  ctx.fillText(metaText, paddingX, line2Y);

  ctx.restore();
}
