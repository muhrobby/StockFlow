import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/packing/',
  resolve: {
    alias: {
      '@shared-auth': path.resolve(__dirname, '../../packages/shared-auth/index.js'),
      '@shared-core': path.resolve(__dirname, '../../packages/shared-core/index.js')
    }
  },
  build: {
    outDir: '../../dist/packing',
    emptyOutDir: true
  }
});
