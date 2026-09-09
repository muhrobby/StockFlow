const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('🚀 [Build Monorepo] Memulai proses kompilasi seluruh aplikasi...');

// 1. Bersihkan folder dist/
console.log('🧹 Membersihkan direktori dist/...');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 2. Kompilasi & Salin Portal (apps/portal -> dist/)
console.log('📦 Membangun apps/portal...');
try {
  execSync('npm --workspace=apps/portal run build', {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  fs.copyFileSync(path.join(ROOT_DIR, 'apps/portal/index.html'), path.join(DIST_DIR, 'index.html'));
  copyRecursive(path.join(ROOT_DIR, 'apps/portal/css'), path.join(DIST_DIR, 'css'));
  copyRecursive(path.join(ROOT_DIR, 'apps/portal/js'), path.join(DIST_DIR, 'js'));
  console.log('✅ apps/portal berhasil dikompilasi ke dist/');
} catch (err) {
  console.error('❌ Gagal membangun apps/portal:', err);
  process.exit(1);
}

// 3. Salin packages bersama (packages/ -> dist/packages/) agar ES Module browser bekerja
console.log('📦 Menyalin library shared ke dist/packages/...');
copyRecursive(path.join(ROOT_DIR, 'packages'), path.join(DIST_DIR, 'packages'));

// 4. Kompilasi & Salin StockFlow (apps/stockflow -> dist/stockflow/)
console.log('📦 Membangun apps/stockflow...');
const stockflowDist = path.join(DIST_DIR, 'stockflow');
fs.mkdirSync(stockflowDist, { recursive: true });
try {
  execSync('npm --workspace=apps/stockflow run build', {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  fs.copyFileSync(path.join(ROOT_DIR, 'apps/stockflow/index.html'), path.join(stockflowDist, 'index.html'));
  copyRecursive(path.join(ROOT_DIR, 'apps/stockflow/css'), path.join(stockflowDist, 'css'));
  copyRecursive(path.join(ROOT_DIR, 'apps/stockflow/js'), path.join(stockflowDist, 'js'));
  copyRecursive(path.join(ROOT_DIR, 'apps/stockflow/icons'), path.join(stockflowDist, 'icons'));
  copyRecursive(path.join(ROOT_DIR, 'apps/stockflow/dummy_data'), path.join(stockflowDist, 'dummy_data'));
  if (fs.existsSync(path.join(ROOT_DIR, 'apps/stockflow/manifest.json'))) {
    fs.copyFileSync(path.join(ROOT_DIR, 'apps/stockflow/manifest.json'), path.join(stockflowDist, 'manifest.json'));
  }
  if (fs.existsSync(path.join(ROOT_DIR, 'apps/stockflow/sw.js'))) {
    fs.copyFileSync(path.join(ROOT_DIR, 'apps/stockflow/sw.js'), path.join(stockflowDist, 'sw.js'));
  }
  console.log('✅ apps/stockflow berhasil dikompilasi ke dist/stockflow/');
} catch (err) {
  console.error('❌ Gagal membangun apps/stockflow:', err);
  process.exit(1);
}

// 5. Kompilasi Packing (apps/packing -> dist/packing/ via Vite)
console.log('📦 Membangun apps/packing (Vite + React)...');
try {
  execSync('npm --workspace=apps/packing run build', {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  console.log('✅ apps/packing berhasil dikompilasi ke dist/packing/');
} catch (err) {
  console.error('❌ Gagal membangun apps/packing:', err);
  process.exit(1);
}

// 6. Salin aturan redirect Cloudflare Pages (_redirects)
console.log('📋 Menyalin _redirects ke dist/...');
if (fs.existsSync(path.join(ROOT_DIR, '_redirects'))) {
  fs.copyFileSync(path.join(ROOT_DIR, '_redirects'), path.join(DIST_DIR, '_redirects'));
}

console.log('🎉 [Selesai] Seluruh modul monorepo siap dideploy ke Cloudflare Pages!');
