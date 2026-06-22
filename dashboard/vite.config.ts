import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const API_TARGET = process.env.DASH_API || 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
      '/sounds': { target: API_TARGET, changeOrigin: true },
      '/library': { target: API_TARGET, changeOrigin: true },
      '/element-lib': { target: API_TARGET, changeOrigin: true }
    }
  }
});
